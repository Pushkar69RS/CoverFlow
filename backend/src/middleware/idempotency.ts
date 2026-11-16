import { Request, Response, NextFunction } from 'express';
import { db } from '../db/connection';

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;
  if (!key || req.method !== 'POST') {
    return next();
  }

  try {
    // Check if complaint or job already exists with this key
    const existing = await db.query(
      'SELECT id, unit_id, status, reported_at FROM complaints WHERE idempotency_key = $1 LIMIT 1',
      [key]
    );

    if (existing.rows.length > 0) {
      const complaint = existing.rows[0];
      const jobRes = await db.query(
        'SELECT id, status, sla_class, due_at FROM service_jobs WHERE complaint_id = $1 LIMIT 1',
        [complaint.id]
      );
      const decisionRes = await db.query(
        'SELECT outcome, reason_code FROM coverage_decisions WHERE complaint_id = $1 LIMIT 1',
        [complaint.id]
      );

      res.status(200).json({
        idempotentReplay: true,
        complaint,
        decision: decisionRes.rows[0] || null,
        job: jobRes.rows[0] || null
      });
      return;
    }

    next();
  } catch (err: any) {
    next(err);
  }
}
