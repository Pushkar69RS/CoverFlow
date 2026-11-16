import { Router, Request, Response } from 'express';
import { authMiddleware, AuthenticatedRequest, generateToken } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { ComplaintService } from '../services/complaint.service';
import { DispatchService } from '../services/dispatch.service';
import { PartsService } from '../services/parts.service';
import { BillingService } from '../services/billing.service';
import { UnitService } from '../services/unit.service';
import { db } from '../db/connection';

export const apiRouter = Router();

// Health Check & Invariant Verification Status
apiRouter.get('/health', async (req: Request, res: Response) => {
  try {
    const isEmbedded = db.isEmbedded();
    const counts = await db.query(`
      SELECT 
        (SELECT count(*) FROM units) as total_units,
        (SELECT count(*) FROM complaints) as total_complaints,
        (SELECT count(*) FROM service_jobs) as total_jobs,
        (SELECT count(*) FROM parts) as total_parts,
        (SELECT count(*) FROM service_invoices) as total_invoices;
    `);

    res.json({
      status: 'UP',
      engine: isEmbedded ? 'PostgreSQL 16 (PGlite Embedded Engine)' : 'PostgreSQL 16 (Server Engine)',
      invariantsEnforced: [
        'INVARIANT 1: Zero double claims (Entitlement row lock + counter guard)',
        'INVARIANT 2: Zero stock oversubscription (check_stock_guard + FOR UPDATE)',
        'INVARIANT 3: Zero concurrent technician allocations (partial unique index)'
      ],
      metrics: counts.rows[0]
    });
  } catch (err: any) {
    res.status(500).json({ status: 'DOWN', error: err.message });
  }
});

// Demo Data Reset (Cleans queue to 3 curated tickets for demonstration)
apiRouter.post('/demo/reset-queue', async (_req: Request, res: Response) => {
  try {
    // Rebuild index in case of WASM file pointer corruption
    try {
      await db.query(`DROP INDEX IF EXISTS idx_jobs_dispatch;`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_jobs_dispatch ON service_jobs (branch_id, status, due_at);`);
    } catch {
      // Ignore
    }
    const { runSeeds } = await import('../db/seed');
    await runSeeds();
    res.json({ success: true, message: 'Queue successfully reset to 3 curated tickets!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/demo/fix-index', async (_req: Request, res: Response) => {
  try {
    await db.query(`DROP INDEX IF EXISTS idx_jobs_dispatch;`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_jobs_dispatch ON service_jobs (branch_id, status, due_at);`);
    await db.query(`REINDEX TABLE service_jobs;`);
    res.json({ success: true, message: 'Indexes on service_jobs rebuilt cleanly!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Demo Login & Authentication
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  const userRes = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
  if (userRes.rows.length === 0) {
    res.status(401).json({ error: 'User not found with this email' });
    return;
  }
  const user = userRes.rows[0];

  // Optional password check (supports 'password123' or 'demo' for presentation convenience)
  if (password && password !== 'password123' && password !== 'demo') {
    res.status(401).json({ error: 'Invalid password. (Demo password: password123)' });
    return;
  }

  const token = generateToken({
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    branch_id: user.branch_id
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      phone: user.phone,
      branch_id: user.branch_id
    }
  });
});

apiRouter.get('/auth/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({ user: req.user });
});

// List Users
apiRouter.get('/users', authMiddleware, async (req: Request, res: Response) => {
  const role = req.query.role as string | undefined;
  let sql = 'SELECT id, email, full_name, role, branch_id, phone FROM users';
  const params: any[] = [];
  if (role) {
    sql += ' WHERE role = $1';
    params.push(role);
  }
  sql += ' ORDER BY full_name ASC';
  const users = await db.query(sql, params);
  res.json(users.rows);
});

// Product Models & Terms Versions
apiRouter.get('/models', authMiddleware, async (req: Request, res: Response) => {
  const models = await UnitService.listModels();
  res.json(models);
});

apiRouter.get('/terms', authMiddleware, async (req: Request, res: Response) => {
  const terms = await UnitService.listTermsVersions();
  res.json(terms);
});

// Units
apiRouter.get('/units', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = req.user?.role === 'CUSTOMER' ? req.user.id : undefined;
    const units = await UnitService.listUnits(ownerId);
    res.json(units);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/units', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ownerId = req.body.owner_id || req.user?.id;
    const unit = await UnitService.registerUnit({
      serial_number: req.body.serial_number,
      model_id: req.body.model_id,
      owner_id: ownerId,
      purchase_date: req.body.purchase_date,
      purchase_proof_url: req.body.purchase_proof_url
    });
    res.status(201).json(unit);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Complaints & Coverage Adjudication Pipeline
apiRouter.get('/complaints', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = req.user?.role === 'CUSTOMER' ? req.user.id : undefined;
    const complaints = await ComplaintService.listComplaints(customerId);
    res.json(complaints);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/complaints', authMiddleware, idempotencyMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = req.body.customer_id || req.user?.id;
    const result = await ComplaintService.registerAndAdjudicate({
      unit_id: req.body.unit_id,
      customer_id: customerId,
      fault_category: req.body.fault_category,
      description: req.body.description,
      media_urls: req.body.media_urls,
      idempotency_key: req.body.idempotency_key,
      branch_id: req.body.branch_id || req.user?.branch_id,
      override: req.body.override
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Advisor Escalation & Manager Goodwill In-Place Approval Workflow
apiRouter.post('/complaints/:id/request-goodwill', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { notes } = req.body;
    const result = await ComplaintService.requestGoodwill(req.params.id, notes || 'Front desk advisor requested goodwill review');
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/complaints/:id/approve-goodwill', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let managerId = req.user?.id;
    if (!managerId || managerId === 'manager') {
      const mgrRes = await db.query(`SELECT id FROM users WHERE role = 'MANAGER' LIMIT 1;`);
      managerId = mgrRes.rows[0]?.id;
    }
    if (!managerId) throw new Error('Manager profile could not be resolved');
    const { reason, force_outcome } = req.body;
    const result = await ComplaintService.approveGoodwill(req.params.id, managerId, reason, force_outcome);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/complaints/:id/reject-goodwill', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let managerId = req.user?.id;
    if (!managerId || managerId === 'manager') {
      const mgrRes = await db.query(`SELECT id FROM users WHERE role = 'MANAGER' LIMIT 1;`);
      managerId = mgrRes.rows[0]?.id;
    }
    if (!managerId) throw new Error('Manager profile could not be resolved');
    const { reason } = req.body;
    await ComplaintService.rejectGoodwill(req.params.id, managerId, reason);
    res.json({ success: true, message: 'Goodwill request rejected' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Service Jobs & Technician Dispatch
apiRouter.get('/jobs', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const techId = req.query.technician_id as string | undefined;
    const status = req.query.status as string | undefined;
    const jobs = await DispatchService.listJobs({
      technicianId: techId,
      status
    });
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pull Next Job (Breach-First Queue)
apiRouter.post('/technicians/:id/next-job', authMiddleware, async (req: Request, res: Response) => {
  try {
    const technicianId = req.params.id;
    const branchId = req.body.branch_id;
    const job = await DispatchService.pullNextJobForTechnician(technicianId, branchId);
    if (!job) {
      res.status(200).json({ message: 'No queued jobs available at this time', job: null });
      return;
    }
    res.json({ message: 'Job assigned successfully', job });
  } catch (err: any) {
    if (err.message.includes('TECHNICIAN_BUSY')) {
      res.status(409).json({ error: 'TECHNICIAN_BUSY', message: err.message });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/jobs/:id/diagnosis', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const techId = req.body.technician_id || req.user?.id;
    const job = await DispatchService.recordDiagnosis(
      req.params.id,
      techId,
      req.body.fault_code,
      req.body.diagnosis_notes
    );
    res.json(job);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Spare Parts & Transactional Stock Guard
apiRouter.get('/parts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const parts = await PartsService.listParts();
    res.json(parts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/jobs/:id/parts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const reservations = await PartsService.listJobReservations(req.params.id);
    res.json(reservations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/jobs/:id/parts', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { part_id, quantity } = req.body;
    const reservation = await PartsService.reservePart(req.params.id, part_id, Number(quantity || 1));
    res.status(201).json(reservation);
  } catch (err: any) {
    if (err.message.includes('INSUFFICIENT_STOCK')) {
      res.status(409).json({ error: 'INSUFFICIENT_STOCK', message: err.message });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/parts/:id/restock', authMiddleware, async (req: Request, res: Response) => {
  try {
    const qty = req.body.quantity !== undefined ? Number(req.body.quantity) : 5;
    const updated = await PartsService.restockPart(req.params.id, qty);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Estimates, Completion & Invoices
apiRouter.post('/jobs/:id/estimate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const job = await BillingService.createEstimate(req.params.id, Number(req.body.estimate_amount));
    res.json(job);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/jobs/:id/estimate/approve', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = req.user?.id || 'customer';
    const job = await BillingService.approveEstimate(req.params.id, customerId);
    res.json(job);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/jobs/:id/complete', authMiddleware, async (req: Request, res: Response) => {
  try {
    const labourHours = Number(req.body.labour_hours || 2);
    const result = await BillingService.completeJob(req.params.id, labourHours);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get('/invoices', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customerId = req.user?.role === 'CUSTOMER' ? req.user.id : undefined;
    const invoices = await BillingService.listInvoices(customerId);
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/invoices/:id/payments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { amount, method } = req.body;
    const result = await BillingService.capturePayment(req.params.id, Number(amount), method);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
