import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { db } from '../db/connection';
import { runSeeds } from '../db/seed';

describe('CoverFlow REST API Integration Tests', () => {
  beforeAll(async () => {
    await db.init();
    await runSeeds();
  });

  afterAll(async () => {
    await db.close();
  });

  // TC-01: Health & Invariant Check
  it('TC-01 [API] GET /api/health returns 200 with active PostgreSQL engine and invariant status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.invariantsEnforced).toHaveLength(3);
    expect(res.body.metrics).toBeDefined();
  });

  // TC-02: Models Catalog
  it('TC-02 [API] GET /api/models returns product catalog', async () => {
    const res = await request(app).get('/api/models');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('model_number');
  });

  // TC-03: Unit Registration
  it('TC-03 [API] POST /api/units registers a new unit successfully', async () => {
    const models = await request(app).get('/api/models');
    const modelId = models.body[0].id;

    const users = await request(app).get('/api/users?role=CUSTOMER');
    const customerId = users.body[0].id;

    const serialNumber = `SN-TEST-REG-${Date.now()}`;
    const res = await request(app)
      .post('/api/units')
      .send({
        serial_number: serialNumber,
        model_id: modelId,
        owner_id: customerId,
        purchase_date: '2025-01-15',
        purchase_proof_url: 'https://storage.coverflow.com/proofs/test.pdf'
      });

    expect(res.status).toBe(201);
    expect(res.body.serial_number).toBe(serialNumber);
    expect(res.body.registration_state).toBe('REGISTERED');
  });

  // TC-04: Complaint Intake & Automatic Adjudication Pipeline
  it('TC-04 [API] POST /api/complaints runs deterministic adjudication and generates service job', async () => {
    // Get existing unit with active AMC Comprehensive
    const units = await request(app).get('/api/units');
    const registeredUnit = units.body.find((u: any) => 
      u.registration_state === 'REGISTERED' && 
      u.entitlements?.some((e: any) => e.type === 'AMC_COMPREHENSIVE' && e.status === 'ACTIVE' && e.claims_used < e.claim_quota)
    );
    expect(registeredUnit).toBeDefined();

    const res = await request(app)
      .post('/api/complaints')
      .send({
        unit_id: registeredUnit.id,
        customer_id: registeredUnit.owner_id,
        fault_category: 'DISPLAY_FLICKER',
        description: 'Screen randomly glitches during usage',
        idempotency_key: `IDEMP-${Date.now()}`
      });

    expect(res.status).toBe(201);
    expect(res.body.complaint).toBeDefined();
    expect(res.body.decision).toBeDefined();
    expect(res.body.decision.outcome).toBe('COVERED');
    expect(res.body.decision.reason_code).toBe('PRECEDENCE_AMC_COMPREHENSIVE');
    expect(res.body.job).toBeDefined();
    expect(res.body.job.status).toBe('QUEUED');
  });

  // TC-05: Spare Parts Inventory Listing
  it('TC-05 [API] GET /api/parts returns spare parts with stock on hand and reserved counters', async () => {
    const res = await request(app).get('/api/parts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('stock_on_hand');
    expect(res.body[0]).toHaveProperty('reserved_quantity');
  });

  // TC-06: End-to-End Job Completion & Zero-Value Invoice Generation
  it('TC-06 [API] POST /api/jobs/:id/complete produces zero-value invoice for fully covered job', async () => {
    // 1. Create a fresh complaint on an active AMC unit to test pristine job completion
    const units = await request(app).get('/api/units');
    const registeredUnit = units.body.find((u: any) => 
      u.registration_state === 'REGISTERED' && 
      u.entitlements?.some((e: any) => e.type === 'AMC_COMPREHENSIVE' && e.status === 'ACTIVE' && e.claims_used < e.claim_quota)
    );
    expect(registeredUnit).toBeDefined();

    const compRes = await request(app)
      .post('/api/complaints')
      .send({
        unit_id: registeredUnit.id,
        customer_id: registeredUnit.owner_id,
        fault_category: 'DISPLAY_FLICKER',
        description: 'Prism test for completion settlement'
      });
    expect(compRes.status).toBe(201);
    const newJobId = compRes.body.job.id;

    // 2. Complete the pristine job
    const completeRes = await request(app)
      .post(`/api/jobs/${newJobId}/complete`)
      .send({ labour_hours: 1 });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.invoice).toBeDefined();
    expect(completeRes.body.invoice.status).toBe('ZERO_VALUE');
    expect(Number(completeRes.body.invoice.customer_payable_amount)).toBe(0);
  });
});
