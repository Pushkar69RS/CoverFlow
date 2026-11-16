-- CoverFlow Enterprise Schema
-- Enforces Phase 1 Invariants:
-- 1. No Double Claims (Entitlement row locks + claim counters)
-- 2. No Stock Oversubscription (check_stock_guard + FOR UPDATE)
-- 3. No Double Technician Assignments (Partial unique index on active states)

-- Branches
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users & Roles
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM (
            'CUSTOMER',
            'ADVISOR',
            'TECHNICIAN',
            'STOREKEEPER',
            'MANAGER',
            'FINANCE',
            'ADMIN'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    role user_role NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    phone VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Product Models
CREATE TABLE IF NOT EXISTS product_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_number VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL,
    manufacturer VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registered Units
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registration_state') THEN
        CREATE TYPE registration_state AS ENUM (
            'PENDING_PROOF',
            'REGISTERED',
            'REJECTED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number VARCHAR(128) NOT NULL UNIQUE,
    model_id UUID NOT NULL REFERENCES product_models(id),
    owner_id UUID NOT NULL REFERENCES users(id),
    purchase_date DATE NOT NULL,
    purchase_proof_url TEXT,
    registration_state registration_state NOT NULL DEFAULT 'PENDING_PROOF',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Published Terms Versions
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entitlement_type') THEN
        CREATE TYPE entitlement_type AS ENUM (
            'AMC_COMPREHENSIVE',
            'AMC_LABOUR_ONLY',
            'EXTENDED_WARRANTY',
            'MANUFACTURER_WARRANTY'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS terms_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entitlement_type entitlement_type NOT NULL,
    version_code VARCHAR(32) NOT NULL,
    precedence_rank INT NOT NULL,
    parts_covered BOOLEAN NOT NULL DEFAULT true,
    labour_covered BOOLEAN NOT NULL DEFAULT true,
    claim_quota INT NOT NULL DEFAULT 999,
    sla_hours INT NOT NULL DEFAULT 24,
    exclusions TEXT[] NOT NULL DEFAULT '{}',
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT uq_terms_type_version UNIQUE (entitlement_type, version_code)
);

-- Entitlements (Contracts & Warranties)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entitlement_status') THEN
        CREATE TYPE entitlement_status AS ENUM (
            'ACTIVE',
            'GRACE',
            'LAPSED',
            'EXPIRED',
            'CANCELLED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    terms_version_id UUID NOT NULL REFERENCES terms_versions(id),
    entitlement_type entitlement_type NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    claim_quota INT NOT NULL DEFAULT 1,
    claims_used INT NOT NULL DEFAULT 0,
    status entitlement_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_quota_non_negative CHECK (claims_used >= 0 AND claims_used <= claim_quota)
);

-- Complaints
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'complaint_status') THEN
        CREATE TYPE complaint_status AS ENUM (
            'RECEIVED',
            'ADJUDICATED',
            'CANCELLED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES units(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    fault_category VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    media_urls TEXT[] DEFAULT '{}',
    status complaint_status NOT NULL DEFAULT 'RECEIVED',
    escalation_status VARCHAR(64) DEFAULT 'NONE',
    escalation_notes TEXT,
    idempotency_key VARCHAR(128) UNIQUE,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Coverage Decisions (Immutable Audit of Adjudication)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'adjudication_outcome') THEN
        CREATE TYPE adjudication_outcome AS ENUM (
            'COVERED',
            'PARTIAL',
            'CHARGEABLE',
            'NOT_REGISTERED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS coverage_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
    entitlement_id UUID REFERENCES entitlements(id),
    terms_version_id UUID REFERENCES terms_versions(id),
    outcome adjudication_outcome NOT NULL,
    reason_code VARCHAR(64) NOT NULL,
    override_actor_id UUID REFERENCES users(id),
    override_reason TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service Jobs & SLA Management
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
        CREATE TYPE job_status AS ENUM (
            'QUEUED',
            'ASSIGNED',
            'DIAGNOSED',
            'AWAITING_PARTS',
            'IN_REPAIR',
            'READY',
            'CLOSED',
            'CANCELLED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS service_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL UNIQUE REFERENCES complaints(id),
    coverage_decision_id UUID NOT NULL REFERENCES coverage_decisions(id),
    branch_id UUID NOT NULL REFERENCES branches(id),
    technician_id UUID REFERENCES users(id),
    status job_status NOT NULL DEFAULT 'QUEUED',
    sla_class VARCHAR(32) NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    is_sla_breached BOOLEAN NOT NULL DEFAULT false,
    diagnosis_notes TEXT,
    fault_code VARCHAR(64),
    estimate_amount NUMERIC(10, 2) DEFAULT 0.00,
    customer_approved_estimate BOOLEAN DEFAULT false,
    estimate_approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

-- INVARIANT 3: Technician cannot hold two active assignments simultaneously!
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_technician_assignment 
ON service_jobs (technician_id) 
WHERE technician_id IS NOT NULL AND status IN ('ASSIGNED', 'DIAGNOSED', 'IN_REPAIR');

-- Spare Parts & Transactional Stock Guard
CREATE TABLE IF NOT EXISTS parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL,
    unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    stock_on_hand INT NOT NULL DEFAULT 0,
    reserved_quantity INT NOT NULL DEFAULT 0,
    min_threshold INT NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- INVARIANT 2: Reserved quantity must never exceed stock on hand!
    CONSTRAINT check_stock_guard CHECK (
        stock_on_hand >= 0 AND 
        reserved_quantity >= 0 AND 
        reserved_quantity <= stock_on_hand
    )
);

-- Part Reservations with Lease Expiry
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
        CREATE TYPE reservation_status AS ENUM (
            'RESERVED',
            'ISSUED',
            'RELEASED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS part_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
    part_id UUID NOT NULL REFERENCES parts(id),
    quantity INT NOT NULL DEFAULT 1,
    status reservation_status NOT NULL DEFAULT 'RESERVED',
    lease_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoices & Settlement
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
        CREATE TYPE invoice_status AS ENUM (
            'DRAFT',
            'ZERO_VALUE',
            'ISSUED',
            'PART_PAID',
            'SETTLED',
            'VOID'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS service_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL UNIQUE REFERENCES service_jobs(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    total_labour_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_parts_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    covered_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    customer_payable_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status invoice_status NOT NULL DEFAULT 'DRAFT',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ,
    CONSTRAINT check_invoice_split CHECK (
        (covered_amount + customer_payable_amount) = (total_labour_cost + total_parts_cost)
    )
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES service_invoices(id),
    amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(32) NOT NULL,
    reference_number VARCHAR(128),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Outbox Events for Async Workers & Reliability
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Audit Log (Immutable Record of Consequential Actions)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id),
    entity_type VARCHAR(64) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(64) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance & SLA lookups
CREATE INDEX IF NOT EXISTS idx_jobs_dispatch ON service_jobs (branch_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_jobs_sla_check ON service_jobs (status, due_at) WHERE status NOT IN ('READY', 'CLOSED', 'CANCELLED');
CREATE INDEX IF NOT EXISTS idx_entitlements_unit ON entitlements (unit_id, status);
