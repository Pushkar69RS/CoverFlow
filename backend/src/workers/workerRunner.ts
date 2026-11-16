import { db } from '../db/connection';

export class WorkerRunner {
  private timer: NodeJS.Timeout | null = null;
  private running: boolean = false;

  public start(intervalMs: number = 30000) {
    if (this.running) return;
    this.running = true;
    console.log('⏱️  Background Workers (SLA Timers & Renewal Sweep) started.');

    // Run immediately on boot, then periodically
    this.runCycle().catch(console.error);

    this.timer = setInterval(() => {
      this.runCycle().catch(console.error);
    }, intervalMs);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('⏱️  Background Workers stopped.');
  }

  public async runCycle() {
    await this.runSlaBreachCheck();
    await this.runAmcRenewalSweep();
  }

  // 1. SLA Breach Monitor
  private async runSlaBreachCheck() {
    try {
      const breached = await db.query(`
        UPDATE service_jobs
        SET is_sla_breached = true
        WHERE status NOT IN ('READY', 'CLOSED', 'CANCELLED')
          AND due_at < NOW()
          AND is_sla_breached = false
        RETURNING id, sla_class, due_at, status;
      `);

      if (breached.rows.length > 0) {
        console.warn(`🚨 [SLA Worker] Detected ${breached.rows.length} newly breached service jobs!`);
        for (const job of breached.rows) {
          await db.query(`
            INSERT INTO outbox_events (event_type, payload)
            VALUES ('SlaBreached', $1);
          `, [JSON.stringify(job)]);
        }
      }
    } catch (err: any) {
      console.error('[SLA Worker Error]:', err.message);
    }
  }

  // 2. AMC Renewal & Grace/Lapse Sweep (FR-14)
  private async runAmcRenewalSweep() {
    try {
      // Transition past-end-date contracts to GRACE (within 15 days)
      const toGrace = await db.query(`
        UPDATE entitlements
        SET status = 'GRACE'
        WHERE entitlement_type::text LIKE 'AMC%'
          AND status = 'ACTIVE'
          AND end_date < CURRENT_DATE
          AND CURRENT_DATE <= (end_date + INTERVAL '15 days')
        RETURNING id;
      `);

      if (toGrace.rows.length > 0) {
        console.log(`ℹ️ [Renewal Worker] Moved ${toGrace.rows.length} AMC contracts to GRACE window.`);
      }

      // Transition past-grace contracts to explicit LAPSED with timestamp (FR-14)
      const toLapsed = await db.query(`
        UPDATE entitlements
        SET status = 'LAPSED'
        WHERE entitlement_type::text LIKE 'AMC%'
          AND status IN ('ACTIVE', 'GRACE')
          AND CURRENT_DATE > (end_date + INTERVAL '15 days')
        RETURNING id;
      `);

      if (toLapsed.rows.length > 0) {
        console.warn(`⚠️ [Renewal Worker] Explicitly marked ${toLapsed.rows.length} AMC contracts as LAPSED.`);
        for (const c of toLapsed.rows) {
          await db.query(`
            INSERT INTO outbox_events (event_type, payload)
            VALUES ('ContractLapsed', $1);
          `, [JSON.stringify({ entitlement_id: c.id, lapsed_at: new Date().toISOString() })]);
        }
      }
    } catch (err: any) {
      console.error('[Renewal Worker Error]:', err.message);
    }
  }
}

export const backgroundWorkers = new WorkerRunner();
