import { db } from '../db/connection';

export class DispatchService {
  // INVARIANT 3: Technician cannot hold two active assignments simultaneously
  public static async pullNextJobForTechnician(technicianId: string, branchId?: string) {
    const client = await db.getTransactionClient();
    try {
      // 1. Guard check: Is this technician already assigned to an active job?
      const activeRes = await client.query(`
        SELECT id, status, due_at, complaint_id
        FROM service_jobs
        WHERE technician_id = $1 
          AND status::text IN ('ASSIGNED', 'DIAGNOSED', 'IN_REPAIR')
        LIMIT 1;
      `, [technicianId]);

      if (activeRes.rows.length > 0) {
        throw new Error(
          `TECHNICIAN_BUSY: Technician is already working on active job ${activeRes.rows[0].id} (${activeRes.rows[0].status}). Complete or release current job first.`
        );
      }

      // 2. Query next queued job using Breach-First ordering (due_at ASC)
      let query = `
        SELECT sj.*, cd.outcome, cd.reason_code, c.fault_category, u.serial_number, pm.name as product_name
        FROM service_jobs sj
        JOIN complaints c ON sj.complaint_id = c.id
        JOIN coverage_decisions cd ON sj.coverage_decision_id = cd.id
        JOIN units u ON c.unit_id = u.id
        JOIN product_models pm ON u.model_id = pm.id
        WHERE sj.status = 'QUEUED'
      `;
      const params: any[] = [];

      if (branchId) {
        params.push(branchId);
        query += ` AND sj.branch_id = $${params.length}`;
      }

      // Breach-First Ordering (due_at ASC ensures earliest deadline is pulled first)
      query += ` ORDER BY sj.due_at ASC LIMIT 1 FOR UPDATE OF sj SKIP LOCKED;`;

      let candidateRes;
      try {
        candidateRes = await client.query(query, params);
      } catch (err: any) {
        if (err.message && (err.message.includes('idx_jobs_dispatch') || err.message.includes('index') || err.message.includes('sibling'))) {
          await db.query(`DROP INDEX IF EXISTS idx_jobs_dispatch;`);
          await db.query(`CREATE INDEX IF NOT EXISTS idx_jobs_dispatch ON service_jobs (branch_id, status, due_at);`);
          candidateRes = await client.query(query, params);
        } else {
          throw err;
        }
      }

      if (candidateRes.rows.length === 0) {
        await client.query('COMMIT');
        return null; // No jobs currently queued
      }

      const nextJob = candidateRes.rows[0];

      // 3. Assign technician to job (Guarded by partial unique index)
      await client.query(`
        UPDATE service_jobs
        SET technician_id = $1, status = 'ASSIGNED'
        WHERE id = $2;
      `, [technicianId, nextJob.id]);

      // 4. Audit Log
      await client.query(`
        INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, after_state, reason)
        VALUES ($1, 'SERVICE_JOB', $2, 'DISPATCH_ASSIGN', $3, 'Breach-first technician pull assignment');
      `, [technicianId, nextJob.id, JSON.stringify({ assignedTo: technicianId, dueAt: nextJob.due_at })]);

      await client.query('COMMIT');
      return { ...nextJob, status: 'ASSIGNED', technician_id: technicianId };
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.message?.includes('idx_active_technician_assignment') || err.code === '23505') {
        throw new Error(`TECHNICIAN_BUSY: Technician is already working on an active job.`);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  public static async recordDiagnosis(jobId: string, technicianId: string, faultCode: string, notes: string) {
    const res = await db.query(`
      UPDATE service_jobs
      SET fault_code = $1, diagnosis_notes = $2, status = 'DIAGNOSED'
      WHERE id = $3 AND technician_id = $4
      RETURNING *;
    `, [faultCode, notes, jobId, technicianId]);

    if (res.rows.length === 0) {
      throw new Error(`Job ${jobId} not found or not assigned to technician.`);
    }
    return res.rows[0];
  }

  public static async listJobs(filter?: { status?: string; technicianId?: string; branchId?: string }) {
    let sql = `
      SELECT 
        sj.*, 
        cd.outcome, 
        cd.reason_code, 
        c.fault_category, 
        c.description as fault_description,
        u.serial_number, 
        pm.name as product_name,
        pm.category as product_category,
        usr.full_name as customer_name,
        usr.phone as customer_phone,
        tech.full_name as technician_name,
        (sj.due_at < NOW() AND sj.status NOT IN ('READY', 'CLOSED', 'CANCELLED')) as is_currently_breached
      FROM service_jobs sj
      JOIN complaints c ON sj.complaint_id = c.id
      JOIN coverage_decisions cd ON sj.coverage_decision_id = cd.id
      JOIN units u ON c.unit_id = u.id
      JOIN product_models pm ON u.model_id = pm.id
      JOIN users usr ON c.customer_id = usr.id
      LEFT JOIN users tech ON sj.technician_id = tech.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filter?.status) {
      params.push(filter.status);
      sql += ` AND sj.status = $${params.length}`;
    }
    if (filter?.technicianId) {
      params.push(filter.technicianId);
      sql += ` AND sj.technician_id = $${params.length}`;
    }
    if (filter?.branchId) {
      params.push(filter.branchId);
      sql += ` AND sj.branch_id = $${params.length}`;
    }

    sql += ` ORDER BY sj.due_at ASC;`;
    try {
      const res = await db.query(sql, params);
      return res.rows;
    } catch (err: any) {
      if (err.message && (err.message.includes('idx_jobs_dispatch') || err.message.includes('index') || err.message.includes('sibling'))) {
        await db.query(`DROP INDEX IF EXISTS idx_jobs_dispatch;`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_jobs_dispatch ON service_jobs (branch_id, status, due_at);`);
        const res = await db.query(sql, params);
        return res.rows;
      }
      throw err;
    }
  }
}
