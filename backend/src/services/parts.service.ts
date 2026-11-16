import { db } from '../db/connection';

export class PartsService {
  private static partsEnsured = false;

  public static async listParts() {
    if (!this.partsEnsured) {
      try {
        await db.query(`
          INSERT INTO parts (part_code, name, category, unit_cost, stock_on_hand, reserved_quantity, min_threshold)
          VALUES
            ('REF-COMP-INV', 'Smart Inverter Compressor Motor', 'Compressor', 145.00, 8, 0, 3),
            ('REF-THERM-DEF', 'Digital Defrost Thermostat & Sensor', 'Sensors', 35.00, 15, 0, 3),
            ('REF-EVAP-FAN', 'Evaporator Cooling Fan Assembly', 'Cooling', 55.00, 10, 0, 3),
            ('REF-DOOR-GSK', 'Magnetic Door Gasket Seal', 'Gaskets', 28.00, 12, 0, 3)
          ON CONFLICT (part_code) DO NOTHING;
        `);
        this.partsEnsured = true;
      } catch {
        // Fallthrough if table doesn't exist yet
      }
    }

    const res = await db.query(`
      SELECT 
        id, 
        part_code, 
        name, 
        category, 
        unit_cost, 
        stock_on_hand, 
        reserved_quantity, 
        (stock_on_hand - reserved_quantity) as available_quantity,
        min_threshold
      FROM parts 
      ORDER BY name ASC;
    `);
    return res.rows;
  }

  // INVARIANT 2: Transactional Stock Guard (reserved_quantity <= stock_on_hand)
  public static async reservePart(jobId: string, partId: string, quantity: number = 1) {
    if (quantity <= 0) {
      throw new Error('Quantity must be greater than zero.');
    }

    const client = await db.getTransactionClient();
    try {
      // 1. Lock the Part Row FOR UPDATE
      const partRes = await client.query(`
        SELECT id, part_code, name, stock_on_hand, reserved_quantity, unit_cost
        FROM parts
        WHERE id = $1
        FOR UPDATE;
      `, [partId]);

      if (partRes.rows.length === 0) {
        throw new Error(`Part with ID ${partId} not found.`);
      }

      const part = partRes.rows[0];
      const stockOnHand = Number(part.stock_on_hand);
      const currentReserved = Number(part.reserved_quantity);
      const available = stockOnHand - currentReserved;

      // 2. Enforce Stock Guard Invariant
      if (currentReserved + quantity > stockOnHand) {
        throw new Error(
          `INSUFFICIENT_STOCK: Requested ${quantity} units of ${part.name} (${part.part_code}), but only ${available} available (${currentReserved}/${stockOnHand} reserved).`
        );
      }

      // 3. Atomically update reserved quantity
      await client.query(`
        UPDATE parts
        SET reserved_quantity = reserved_quantity + $1
        WHERE id = $2;
      `, [quantity, partId]);

      // 4. Create Part Reservation record with 24-hour lease expiry
      const leaseExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const resRecord = await client.query(`
        INSERT INTO part_reservations (job_id, part_id, quantity, status, lease_expires_at)
        VALUES ($1, $2, $3, 'RESERVED', $4)
        RETURNING id, job_id, part_id, quantity, status, lease_expires_at, created_at;
      `, [jobId, partId, quantity, leaseExpiry.toISOString()]);

      // 5. Update Job status to AWAITING_PARTS or keep in diagnosis
      await client.query(`
        UPDATE service_jobs
        SET status = CASE WHEN status = 'QUEUED' THEN 'DIAGNOSED' ELSE status END
        WHERE id = $1;
      `, [jobId]);

      // 6. Record Audit Log
      await client.query(`
        INSERT INTO audit_logs (entity_type, entity_id, action, after_state, reason)
        VALUES ('PART', $1, 'RESERVE_STOCK', $2, 'Part reserved for job execution');
      `, [partId, JSON.stringify({ jobId, partId, quantity, availableAfter: available - quantity })]);

      await client.query('COMMIT');
      return resRecord.rows[0];
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public static async listJobReservations(jobId: string) {
    const res = await db.query(`
      SELECT pr.*, p.part_code, p.name as part_name, p.unit_cost
      FROM part_reservations pr
      JOIN parts p ON pr.part_id = p.id
      WHERE pr.job_id = $1
      ORDER BY pr.created_at ASC;
    `, [jobId]);
    return res.rows;
  }

  public static async restockPart(partId: string, quantity: number) {
    if (quantity <= 0) throw new Error('Restock quantity must be positive');
    const res = await db.query(`
      UPDATE parts
      SET stock_on_hand = stock_on_hand + $1
      WHERE id = $2
      RETURNING *;
    `, [quantity, partId]);
    if (res.rows.length === 0) throw new Error(`Part ${partId} not found.`);
    return res.rows[0];
  }
}
