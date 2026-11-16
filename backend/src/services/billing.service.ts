import { db } from '../db/connection';

export class BillingService {
  public static async createEstimate(jobId: string, estimatedAmount: number) {
    const res = await db.query(`
      UPDATE service_jobs
      SET estimate_amount = $1, customer_approved_estimate = false
      WHERE id = $2
      RETURNING *;
    `, [estimatedAmount, jobId]);
    return res.rows[0];
  }

  public static async approveEstimate(jobId: string, _customerId: string) {
    const res = await db.query(`
      UPDATE service_jobs
      SET customer_approved_estimate = true, estimate_approved_at = NOW(), status = 'IN_REPAIR'
      WHERE id = $1
      RETURNING *;
    `, [jobId]);
    return res.rows[0];
  }

  public static async completeJob(jobId: string, labourHours: number = 2, hourlyRate: number = 40.0) {
    const client = await db.getTransactionClient();
    try {
      // 1. Get Job & Coverage Decision
      const jobRes = await client.query(`
        SELECT sj.*, cd.outcome, c.customer_id
        FROM service_jobs sj
        JOIN coverage_decisions cd ON sj.coverage_decision_id = cd.id
        JOIN complaints c ON sj.complaint_id = c.id
        WHERE sj.id = $1
        FOR UPDATE;
      `, [jobId]);

      if (jobRes.rows.length === 0) {
        throw new Error(`Job ${jobId} not found.`);
      }
      const job = jobRes.rows[0];

      // If already closed, return existing invoice safely
      if (job.status === 'CLOSED') {
        const existingInv = await client.query('SELECT * FROM service_invoices WHERE job_id = $1', [jobId]);
        await client.query('COMMIT');
        return { job, invoice: existingInv.rows[0] || null };
      }

      // 2. Consume reserved parts & update stock on hand
      const reservations = await client.query(`
        SELECT pr.*, p.unit_cost
        FROM part_reservations pr
        JOIN parts p ON pr.part_id = p.id
        WHERE pr.job_id = $1 AND pr.status = 'RESERVED'
        FOR UPDATE;
      `, [jobId]);

      let totalPartsCost = 0;
      for (const r of reservations.rows) {
        const qty = Number(r.quantity);
        const cost = Number(r.unit_cost);
        totalPartsCost += qty * cost;

        // Deduct from stock on hand and decrement reserved quantity
        await client.query(`
          UPDATE parts
          SET stock_on_hand = stock_on_hand - $1,
              reserved_quantity = reserved_quantity - $1
          WHERE id = $2;
        `, [qty, r.part_id]);

        await client.query(`
          UPDATE part_reservations
          SET status = 'ISSUED'
          WHERE id = $1;
        `, [r.id]);
      }

      const totalLabourCost = labourHours * hourlyRate;
      const totalCost = totalLabourCost + totalPartsCost;

      // 3. Compute Covered vs Customer Payable Split
      let coveredAmount = 0;
      let customerPayable = 0;
      let invoiceStatus: 'ZERO_VALUE' | 'ISSUED' = 'ISSUED';

      if (job.outcome === 'COVERED') {
        coveredAmount = totalCost;
        customerPayable = 0;
        invoiceStatus = 'ZERO_VALUE';
      } else if (job.outcome === 'PARTIAL') {
        coveredAmount = totalLabourCost; // Labour covered, parts payable
        customerPayable = totalPartsCost;
        invoiceStatus = customerPayable === 0 ? 'ZERO_VALUE' : 'ISSUED';
      } else {
        // CHARGEABLE or NOT_REGISTERED
        coveredAmount = 0;
        customerPayable = totalCost;
      }

      // 4. Create or Update Service Invoice (Idempotent UPSERT on job_id)
      const invRes = await client.query(`
        INSERT INTO service_invoices 
        (job_id, customer_id, total_labour_cost, total_parts_cost, covered_amount, customer_payable_amount, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7::invoice_status)
        ON CONFLICT (job_id) DO UPDATE SET
          total_labour_cost = EXCLUDED.total_labour_cost,
          total_parts_cost = EXCLUDED.total_parts_cost,
          covered_amount = EXCLUDED.covered_amount,
          customer_payable_amount = EXCLUDED.customer_payable_amount,
          status = EXCLUDED.status
        RETURNING *;
      `, [
        job.id,
        job.customer_id,
        totalLabourCost,
        totalPartsCost,
        coveredAmount,
        customerPayable,
        invoiceStatus
      ]);
      const invoice = invRes.rows[0];

      // 5. Update Job status
      // If invoice is zero-value, job can immediately transition to READY or CLOSED
      const nextJobStatus = invoiceStatus === 'ZERO_VALUE' ? 'CLOSED' : 'READY';
      const closedAt = nextJobStatus === 'CLOSED' ? new Date().toISOString() : null;

      await client.query(`
        UPDATE service_jobs
        SET status = $1::job_status, closed_at = $2
        WHERE id = $3;
      `, [nextJobStatus, closedAt, jobId]);

      await client.query('COMMIT');
      return { job: { ...job, status: nextJobStatus }, invoice };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async capturePayment(invoiceId: string, amount: number, method: string = 'CARD') {
    const client = await db.getTransactionClient();
    try {
      const invRes = await client.query('SELECT * FROM service_invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      if (invRes.rows.length === 0) {
        throw new Error('Invoice not found.');
      }
      const invoice = invRes.rows[0];

      // Insert payment record
      await client.query(`
        INSERT INTO payments (invoice_id, amount, payment_method, reference_number)
        VALUES ($1, $2, $3, $4);
      `, [invoiceId, amount, method, `REF-${Date.now()}`]);

      // Update invoice status to SETTLED
      await client.query(`
        UPDATE service_invoices
        SET status = 'SETTLED', settled_at = NOW()
        WHERE id = $1;
      `, [invoiceId]);

      // Close the associated job
      await client.query(`
        UPDATE service_jobs
        SET status = 'CLOSED', closed_at = NOW()
        WHERE id = $1;
      `, [invoice.job_id]);

      await client.query('COMMIT');
      return { settled: true, invoiceId };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async listInvoices(customerId?: string) {
    let sql = `
      SELECT si.*, sj.status as job_status, u.serial_number, pm.name as product_name, usr.full_name as customer_name
      FROM service_invoices si
      JOIN service_jobs sj ON si.job_id = sj.id
      JOIN complaints c ON sj.complaint_id = c.id
      JOIN units u ON c.unit_id = u.id
      JOIN product_models pm ON u.model_id = pm.id
      JOIN users usr ON si.customer_id = usr.id
    `;
    const params: any[] = [];
    if (customerId) {
      params.push(customerId);
      sql += ` WHERE si.customer_id = $1`;
    }
    sql += ` ORDER BY si.issued_at DESC;`;
    const res = await db.query(sql, params);
    return res.rows;
  }
}
