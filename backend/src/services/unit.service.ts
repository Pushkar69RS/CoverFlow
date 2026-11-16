import { db } from '../db/connection';

export class UnitService {
  public static async registerUnit(input: {
    serial_number: string;
    model_id: string;
    owner_id: string;
    purchase_date: string;
    purchase_proof_url?: string;
  }) {
    // Check duplicate serial number
    const dupCheck = await db.query('SELECT id FROM units WHERE serial_number = $1', [input.serial_number]);
    if (dupCheck.rows.length > 0) {
      throw new Error(`Serial number ${input.serial_number} is already registered.`);
    }

    const state = input.purchase_proof_url ? 'REGISTERED' : 'PENDING_PROOF';

    const res = await db.query(`
      INSERT INTO units (serial_number, model_id, owner_id, purchase_date, purchase_proof_url, registration_state)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `, [
      input.serial_number,
      input.model_id,
      input.owner_id,
      input.purchase_date,
      input.purchase_proof_url || null,
      state
    ]);
    const newUnit = res.rows[0];

    // Provision default Manufacturer Warranty (1 year coverage)
    try {
      const tvRes = await db.query(
        "SELECT id FROM terms_versions WHERE entitlement_type = 'MANUFACTURER_WARRANTY' ORDER BY precedence_rank ASC LIMIT 1"
      );
      if (tvRes.rows.length > 0) {
        const termsId = tvRes.rows[0].id;
        const pDate = new Date(input.purchase_date);
        const expDate = new Date(pDate);
        expDate.setFullYear(expDate.getFullYear() + 1);

        await db.query(`
          INSERT INTO entitlements (unit_id, terms_version_id, entitlement_type, start_date, end_date, claim_quota, claims_used, status)
          VALUES ($1, $2, 'MANUFACTURER_WARRANTY', $3, $4, 2, 0, 'ACTIVE')
          ON CONFLICT DO NOTHING;
        `, [newUnit.id, termsId, input.purchase_date, expDate.toISOString().split('T')[0]]);
      }
    } catch (e) {
      console.warn('Could not auto-attach initial warranty entitlement:', e);
    }

    return newUnit;
  }

  public static async listUnits(ownerId?: string) {
    let sql = `
      SELECT 
        u.*, 
        pm.name as model_name, 
        pm.model_number, 
        pm.category as model_category,
        pm.manufacturer,
        usr.full_name as owner_name,
        usr.email as owner_email,
        (
          SELECT json_agg(json_build_object(
            'id', e.id,
            'type', e.entitlement_type,
            'status', e.status,
            'start_date', e.start_date,
            'end_date', e.end_date,
            'claim_quota', e.claim_quota,
            'claims_used', e.claims_used,
            'version_code', tv.version_code
          ))
          FROM entitlements e
          JOIN terms_versions tv ON e.terms_version_id = tv.id
          WHERE e.unit_id = u.id
        ) as entitlements
      FROM units u
      JOIN product_models pm ON u.model_id = pm.id
      JOIN users usr ON u.owner_id = usr.id
    `;
    const params: any[] = [];
    if (ownerId) {
      params.push(ownerId);
      sql += ` WHERE u.owner_id = $1`;
    }
    sql += ` ORDER BY u.created_at DESC;`;

    const res = await db.query(sql, params);
    return res.rows;
  }

  public static async listModels() {
    const res = await db.query('SELECT * FROM product_models ORDER BY name ASC;');
    return res.rows;
  }

  public static async listTermsVersions() {
    const res = await db.query('SELECT * FROM terms_versions WHERE is_active = true ORDER BY precedence_rank ASC;');
    return res.rows;
  }
}
