import { db } from '../db/connection';
import { evaluateCoverage } from '../adjudication/engine';
import { AdjudicationContext, EntitlementCandidate } from '../adjudication/types';

export interface CreateComplaintInput {
  unit_id: string;
  customer_id: string;
  fault_category: string;
  description: string;
  media_urls?: string[];
  idempotency_key?: string;
  branch_id?: string;
  override?: {
    actor_id: string;
    reason: string;
    force_outcome?: any;
  };
}

export class ComplaintService {
  public static async registerAndAdjudicate(input: CreateComplaintInput) {
    const client = await db.getTransactionClient();
    try {
      // 1. Check idempotency if provided
      if (input.idempotency_key) {
        const idempCheck = await client.query(
          'SELECT id FROM complaints WHERE idempotency_key = $1',
          [input.idempotency_key]
        );
        if (idempCheck.rows.length > 0) {
          throw new Error(`Duplicate request with idempotency key: ${input.idempotency_key}`);
        }
      }

      // 2. Fetch Unit under lock
      const unitRes = await client.query(
        'SELECT id, serial_number, owner_id, registration_state, purchase_date FROM units WHERE id = $1',
        [input.unit_id]
      );
      if (unitRes.rows.length === 0) {
        throw new Error(`Unit with ID ${input.unit_id} not found.`);
      }
      const unit = unitRes.rows[0];

      // 3. Fetch & Lock all Entitlements on this Unit (INVARIANT 1: Zero double claims)
      const entRes = await client.query(`
        SELECT 
          e.id, 
          e.entitlement_type, 
          e.terms_version_id, 
          e.start_date, 
          e.end_date, 
          e.claim_quota, 
          e.claims_used, 
          e.status,
          tv.version_code,
          tv.precedence_rank,
          tv.parts_covered,
          tv.labour_covered,
          tv.sla_hours,
          tv.exclusions
        FROM entitlements e
        JOIN terms_versions tv ON e.terms_version_id = tv.id
        WHERE e.unit_id = $1
        FOR UPDATE;
      `, [input.unit_id]);

      const candidates: EntitlementCandidate[] = entRes.rows.map(r => ({
        id: r.id,
        entitlement_type: r.entitlement_type,
        terms_version_id: r.terms_version_id,
        version_code: r.version_code,
        precedence_rank: r.precedence_rank,
        start_date: new Date(r.start_date).toISOString().split('T')[0],
        end_date: new Date(r.end_date).toISOString().split('T')[0],
        status: r.status,
        claim_quota: Number(r.claim_quota),
        claims_used: Number(r.claims_used),
        parts_covered: Boolean(r.parts_covered),
        labour_covered: Boolean(r.labour_covered),
        sla_hours: Number(r.sla_hours),
        exclusions: r.exclusions || []
      }));

      // 4. Run Pure Deterministic Coverage Adjudication
      const todayStr = new Date().toISOString().split('T')[0];
      const adjudicationContext: AdjudicationContext = {
        unit_id: unit.id,
        registration_state: unit.registration_state,
        fault_category: input.fault_category,
        fault_date: todayStr,
        entitlements: candidates,
        override: input.override
      };

      const decision = evaluateCoverage(adjudicationContext);

      // 5. If entitlement was chosen, atomically increment claims_used
      if (decision.chosen_entitlement_id && !decision.is_override) {
        await client.query(`
          UPDATE entitlements
          SET claims_used = claims_used + 1
          WHERE id = $1;
        `, [decision.chosen_entitlement_id]);
      }

      // 6. Insert Complaint
      const compRes = await client.query(`
        INSERT INTO complaints (unit_id, customer_id, fault_category, description, media_urls, status, idempotency_key)
        VALUES ($1, $2, $3, $4, $5, 'ADJUDICATED', $6)
        RETURNING id, unit_id, customer_id, fault_category, status, reported_at;
      `, [
        input.unit_id,
        input.customer_id,
        input.fault_category,
        input.description,
        input.media_urls || [],
        input.idempotency_key || null
      ]);
      const complaint = compRes.rows[0];

      // 7. Insert Immutable Coverage Decision
      const decRes = await client.query(`
        INSERT INTO coverage_decisions 
        (complaint_id, entitlement_id, terms_version_id, outcome, reason_code, override_actor_id, override_reason)
        VALUES ($1, $2, $3, $4::adjudication_outcome, $5, $6, $7)
        RETURNING id, outcome, reason_code, decided_at;
      `, [
        complaint.id,
        decision.chosen_entitlement_id,
        decision.terms_version_id,
        decision.outcome,
        decision.reason_code,
        input.override?.actor_id || null,
        input.override?.reason || null
      ]);
      const savedDecision = decRes.rows[0];

      // 8. Create Service Job with SLA due time
      // Determine default branch if not passed
      let branchId = input.branch_id;
      if (!branchId) {
        const branchRes = await client.query('SELECT id FROM branches LIMIT 1');
        branchId = branchRes.rows[0]?.id;
      }

      const dueAt = new Date(Date.now() + decision.sla_hours * 60 * 60 * 1000);

      const jobRes = await client.query(`
        INSERT INTO service_jobs 
        (complaint_id, coverage_decision_id, branch_id, status, sla_class, due_at)
        VALUES ($1, $2, $3, 'QUEUED', $4, $5)
        RETURNING id, status, sla_class, due_at, created_at;
      `, [
        complaint.id,
        savedDecision.id,
        branchId,
        `SLA-${decision.sla_hours}H`,
        dueAt.toISOString()
      ]);
      const job = jobRes.rows[0];

      // 9. Write Audit Log & Outbox Event
      await client.query(`
        INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, after_state, reason)
        VALUES ($1, 'COMPLAINT', $2, 'ADJUDICATE_AND_CREATE_JOB', $3, $4);
      `, [
        input.customer_id,
        complaint.id,
        JSON.stringify({ decision, job_id: job.id }),
        decision.reason_code
      ]);

      await client.query(`
        INSERT INTO outbox_events (event_type, payload)
        VALUES ('CoverageAdjudicated', $1);
      `, [JSON.stringify({ complaint_id: complaint.id, decision_id: savedDecision.id, job_id: job.id })]);

      // Commit transaction
      await client.query('COMMIT');

      return {
        complaint,
        decision: { ...savedDecision, ...decision },
        job
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async requestGoodwill(complaintId: string, notes: string) {
    const res = await db.query(`
      UPDATE complaints
      SET escalation_status = 'PENDING_GOODWILL', escalation_notes = $1
      WHERE id = $2
      RETURNING *;
    `, [notes, complaintId]);
    if (res.rows.length === 0) throw new Error('Complaint not found');
    return res.rows[0];
  }

  public static async approveGoodwill(complaintId: string, managerId: string, reason: string = 'Service Manager Goodwill Override Approved', forceOutcome: string = 'COVERED') {
    const client = await db.getTransactionClient();
    try {
      // 1. Update Decision in place on the original ticket!
      const decRes = await client.query(`
        UPDATE coverage_decisions
        SET outcome = $1::adjudication_outcome,
            reason_code = 'GOODWILL_OVERRIDE_RECORDED',
            override_actor_id = $2,
            override_reason = $3,
            decided_at = NOW()
        WHERE complaint_id = $4
        RETURNING *;
      `, [forceOutcome, managerId, reason, complaintId]);

      // 2. Update Complaint escalation status
      await client.query(`
        UPDATE complaints
        SET escalation_status = 'GOODWILL_APPROVED'
        WHERE id = $1;
      `, [complaintId]);

      // 3. Update Service Job SLA if needed
      await client.query(`
        UPDATE service_jobs
        SET sla_class = 'SLA-4H'
        WHERE complaint_id = $1;
      `, [complaintId]);

      // 4. Audit Log
      await client.query(`
        INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, after_state, reason)
        VALUES ($1, 'COMPLAINT', $2, 'GOODWILL_OVERRIDE_APPROVED', $3, $4);
      `, [managerId, complaintId, JSON.stringify(decRes.rows[0]), reason]);

      await client.query('COMMIT');
      return decRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async rejectGoodwill(complaintId: string, managerId: string, reason: string = 'Goodwill request denied') {
    await db.query(`
      UPDATE complaints
      SET escalation_status = 'GOODWILL_REJECTED'
      WHERE id = $1;
    `, [complaintId]);

    await db.query(`
      INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, reason)
      VALUES ($1, 'COMPLAINT', $2, 'GOODWILL_OVERRIDE_REJECTED', $3);
    `, [managerId, complaintId, reason]);
  }

  public static async listComplaints(customerId?: string) {
    if (customerId) {
      const res = await db.query(`
        SELECT c.*, cd.outcome, cd.reason_code, cd.override_actor_id, cd.override_reason, 
               sj.id as job_id, sj.status as job_status, sj.due_at, u.serial_number,
               pm.name as model_name, pm.category as model_category
        FROM complaints c
        LEFT JOIN coverage_decisions cd ON c.id = cd.complaint_id
        LEFT JOIN service_jobs sj ON c.id = sj.complaint_id
        JOIN units u ON c.unit_id = u.id
        JOIN product_models pm ON u.model_id = pm.id
        WHERE c.customer_id = $1
        ORDER BY c.reported_at DESC;
      `, [customerId]);
      return res.rows;
    }

    const res = await db.query(`
      SELECT c.*, cd.outcome, cd.reason_code, cd.override_actor_id, cd.override_reason,
             sj.id as job_id, sj.status as job_status, sj.due_at, u.serial_number, 
             pm.name as model_name, pm.category as model_category,
             usr.full_name as customer_name, usr.email as customer_email, usr.phone as customer_phone
      FROM complaints c
      LEFT JOIN coverage_decisions cd ON c.id = cd.complaint_id
      LEFT JOIN service_jobs sj ON c.id = sj.complaint_id
      JOIN units u ON c.unit_id = u.id
      JOIN product_models pm ON u.model_id = pm.id
      JOIN users usr ON c.customer_id = usr.id
      ORDER BY c.reported_at DESC;
    `);
    return res.rows;
  }
}
