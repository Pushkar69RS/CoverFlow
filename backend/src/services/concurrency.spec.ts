import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db/connection';
import { runSeeds } from '../db/seed';
import { ComplaintService } from './complaint.service';
import { PartsService } from './parts.service';
import { DispatchService } from './dispatch.service';

describe('CoverFlow Critical Concurrency Guards & Transactional Invariants', () => {
  beforeAll(async () => {
    await db.init();
    await runSeeds();
  });

  afterAll(async () => {
    await db.close();
  });

  // ========================================================
  // INVARIANT 1: ZERO DOUBLE CLAIMS UNDER CONCURRENT REQUESTS
  // ========================================================
  it('INVARIANT 1: Two simultaneous requests for the last remaining claim produce exactly one consumption', async () => {
    // 1. Setup a unit with exactly 1 single claim remaining on an Extended Warranty
    const userRes = await db.query("SELECT id FROM users WHERE role = 'CUSTOMER' LIMIT 1");
    const customerId = userRes.rows[0].id;

    const modelRes = await db.query('SELECT id FROM product_models LIMIT 1');
    const modelId = modelRes.rows[0].id;

    const tvRes = await db.query("SELECT id FROM terms_versions WHERE entitlement_type = 'EXTENDED_WARRANTY' LIMIT 1");
    const termsVersionId = tvRes.rows[0].id;

    const unitSerial = `SN-RACE-${Date.now()}`;
    const unitRes = await db.query(`
      INSERT INTO units (serial_number, model_id, owner_id, purchase_date, registration_state)
      VALUES ($1, $2, $3, '2025-01-01', 'REGISTERED')
      RETURNING id;
    `, [unitSerial, modelId, customerId]);
    const unitId = unitRes.rows[0].id;

    // Entitlement with quota = 1, claims_used = 0
    const entRes = await db.query(`
      INSERT INTO entitlements 
      (unit_id, terms_version_id, entitlement_type, start_date, end_date, claim_quota, claims_used, status)
      VALUES ($1, $2, 'EXTENDED_WARRANTY', '2025-01-01', '2027-01-01', 1, 0, 'ACTIVE')
      RETURNING id;
    `, [unitId, termsVersionId]);
    const entitlementId = entRes.rows[0].id;

    // 2. Fire TWO concurrent complaint requests simultaneously
    const reqA = ComplaintService.registerAndAdjudicate({
      unit_id: unitId,
      customer_id: customerId,
      fault_category: 'ELECTRICAL_FAULT',
      description: 'Complaint Thread Alpha'
    });

    const reqB = ComplaintService.registerAndAdjudicate({
      unit_id: unitId,
      customer_id: customerId,
      fault_category: 'ELECTRICAL_FAULT',
      description: 'Complaint Thread Beta'
    });

    const [resA, resB] = await Promise.all([reqA, reqB]);

    // 3. Verification: Exactly ONE must be COVERED, and ONE must be CHARGEABLE (QUOTA_EXHAUSTED)
    const outcomes = [resA.decision.outcome, resB.decision.outcome].sort();
    expect(outcomes).toEqual(['CHARGEABLE', 'COVERED']);

    const coveredRes = resA.decision.outcome === 'COVERED' ? resA : resB;
    const chargeableRes = resA.decision.outcome === 'CHARGEABLE' ? resA : resB;

    expect(coveredRes.decision.reason_code).toBe('PRECEDENCE_EXTENDED_WARRANTY');
    expect(chargeableRes.decision.reason_code).toBe('QUOTA_EXHAUSTED');

    // 4. Verify Database state: claims_used must be EXACTLY 1, never 2!
    const checkDb = await db.query('SELECT claims_used, claim_quota FROM entitlements WHERE id = $1', [entitlementId]);
    expect(Number(checkDb.rows[0].claims_used)).toBe(1);
    expect(Number(checkDb.rows[0].claim_quota)).toBe(1);
  });

  // ========================================================
  // INVARIANT 2: ZERO SPARE PART STOCK OVERSUBSCRIPTION
  // ========================================================
  it('INVARIANT 2: Two technicians reserving the last available spare part produce at most one reservation', async () => {
    // 1. Setup a rare spare part with stock_on_hand = 1, reserved_quantity = 0
    const partCode = `PART-RACE-${Date.now()}`;
    const partRes = await db.query(`
      INSERT INTO parts (part_code, name, category, unit_cost, stock_on_hand, reserved_quantity, min_threshold)
      VALUES ($1, 'Rare Limited Capacitor', 'Electronics', 150.00, 1, 0, 1)
      RETURNING id;
    `, [partCode]);
    const partId = partRes.rows[0].id;

    // Get two distinct jobs
    const jobsRes = await db.query('SELECT id FROM service_jobs LIMIT 2');
    expect(jobsRes.rows.length).toBeGreaterThanOrEqual(2);
    const job1Id = jobsRes.rows[0].id;
    const job2Id = jobsRes.rows[1].id;

    // 2. Fire TWO concurrent reservation requests for quantity = 1 simultaneously
    const resA = PartsService.reservePart(job1Id, partId, 1).then(r => ({ success: true, res: r })).catch(e => ({ success: false, error: e.message }));
    const resB = PartsService.reservePart(job2Id, partId, 1).then(r => ({ success: true, res: r })).catch(e => ({ success: false, error: e.message }));

    const [outcomeA, outcomeB] = await Promise.all([resA, resB]);

    // 3. Verification: Exactly ONE must succeed, and ONE must fail with INSUFFICIENT_STOCK
    const successCount = (outcomeA.success ? 1 : 0) + (outcomeB.success ? 1 : 0);
    const failCount = (!outcomeA.success ? 1 : 0) + (!outcomeB.success ? 1 : 0);

    expect(successCount).toBe(1);
    expect(failCount).toBe(1);

    const failure = !outcomeA.success ? outcomeA : outcomeB;
    expect(failure.error).toContain('INSUFFICIENT_STOCK');

    // 4. Verify Database state: reserved_quantity must be EXACTLY 1, never > stock_on_hand
    const checkPart = await db.query('SELECT stock_on_hand, reserved_quantity FROM parts WHERE id = $1', [partId]);
    expect(Number(checkPart.rows[0].stock_on_hand)).toBe(1);
    expect(Number(checkPart.rows[0].reserved_quantity)).toBe(1);
  });

  // ========================================================
  // INVARIANT 3: ZERO CONCURRENT TECHNICIAN ASSIGNMENTS
  // ========================================================
  it('INVARIANT 3: A technician cannot hold two active assignments simultaneously', async () => {
    const techRes = await db.query("SELECT id FROM users WHERE role = 'TECHNICIAN' LIMIT 1");
    const techId = techRes.rows[0].id;

    // Reset technician assignments first so technician is fresh
    await db.query(`
      UPDATE service_jobs
      SET technician_id = NULL, status = 'QUEUED'
      WHERE technician_id = $1;
    `, [techId]);

    // Pull next job - technician gets assigned to 1 job
    const assignedJob = await DispatchService.pullNextJobForTechnician(techId);
    expect(assignedJob).not.toBeNull();
    expect(assignedJob?.status).toBe('ASSIGNED');

    // Attempting to pull second job while first is still active MUST fail with TECHNICIAN_BUSY
    await expect(DispatchService.pullNextJobForTechnician(techId)).rejects.toThrow('TECHNICIAN_BUSY');
  });
});
