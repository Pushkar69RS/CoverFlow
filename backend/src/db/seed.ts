import { db } from './connection';

export async function runSeeds() {
  console.log('🌱 Seeding database...');

  // 1. Branches
  const b1 = await db.query(`
    INSERT INTO branches (code, name, address)
    VALUES ('B-CENTRAL', 'Central Workshop & Depot', 'Yelahanka Industrial Area, Bengaluru')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id;
  `);
  const branchId = b1.rows[0].id;

  // 2. Users (Password is 'password123' for all demo users)
  const defaultHash = '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6W65WVRWu4mO.L5Q2'; // hashed password123

  const users = [
    { email: 'customer@coverflow.com', name: 'Rohan Sharma', role: 'CUSTOMER', phone: '9876543210' },
    { email: 'advisor@coverflow.com', name: 'Priya Patel', role: 'ADVISOR', phone: '9876543211' },
    { email: 'tech1@coverflow.com', name: 'Arjun Verma', role: 'TECHNICIAN', phone: '9876543212' },
    { email: 'tech2@coverflow.com', name: 'Kavita Nair', role: 'TECHNICIAN', phone: '9876543213' },
    { email: 'storekeeper@coverflow.com', name: 'Deepak Rao', role: 'STOREKEEPER', phone: '9876543214' },
    { email: 'manager@coverflow.com', name: 'Dr. Suresh Kumar', role: 'MANAGER', phone: '9876543215' },
    { email: 'finance@coverflow.com', name: 'Ananya Sen', role: 'FINANCE', phone: '9876543216' },
    { email: 'admin@coverflow.com', name: 'Admin Root', role: 'ADMIN', phone: '9876543217' }
  ];

  const userIds: Record<string, string> = {};
  for (const u of users) {
    const res = await db.query(`
      INSERT INTO users (email, password_hash, full_name, role, branch_id, phone)
      VALUES ($1, $2, $3, $4::user_role, $5, $6)
      ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id, email;
    `, [u.email, defaultHash, u.name, u.role, branchId, u.phone]);
    userIds[u.email] = res.rows[0].id;
  }

  // 3. Product Models
  const models = [
    { model: 'TV-OLED-65X', name: 'Bravia 65" 4K OLED TV', category: 'Television', manufacturer: 'Sony' },
    { model: 'LAP-MBP-16M3', name: 'MacBook Pro 16" M3 Max', category: 'Laptop', manufacturer: 'Apple' },
    { model: 'PHN-IP15P-256', name: 'iPhone 15 Pro 256GB', category: 'Smartphone', manufacturer: 'Apple' },
    { model: 'REF-INV-550', name: 'Smart Inverter Refrigerator', category: 'Appliance', manufacturer: 'Samsung' }
  ];

  const modelIds: Record<string, string> = {};
  for (const m of models) {
    const res = await db.query(`
      INSERT INTO product_models (model_number, name, category, manufacturer)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (model_number) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, model_number;
    `, [m.model, m.name, m.category, m.manufacturer]);
    modelIds[m.model] = res.rows[0].id;
  }

  // 4. Published Terms Versions
  const terms = [
    {
      type: 'AMC_COMPREHENSIVE',
      version: 'v1.0',
      rank: 1,
      parts: true,
      labour: true,
      quota: 10,
      sla: 4,
      exclusions: ['PHYSICAL_DAMAGE', 'LIQUID_SPILL']
    },
    {
      type: 'AMC_LABOUR_ONLY',
      version: 'v1.0',
      rank: 2,
      parts: false,
      labour: true,
      quota: 6,
      sla: 8,
      exclusions: ['PHYSICAL_DAMAGE']
    },
    {
      type: 'EXTENDED_WARRANTY',
      version: 'v1.0',
      rank: 3,
      parts: true,
      labour: true,
      quota: 2,
      sla: 24,
      exclusions: ['COSMETIC_DAMAGE']
    },
    {
      type: 'MANUFACTURER_WARRANTY',
      version: 'v1.0',
      rank: 4,
      parts: true,
      labour: true,
      quota: 1,
      sla: 48,
      exclusions: ['WEAR_AND_TEAR', 'ACCIDENTAL_DROP', 'LIQUID_SPILL']
    }
  ];

  const termsIds: Record<string, string> = {};
  for (const t of terms) {
    const res = await db.query(`
      INSERT INTO terms_versions 
      (entitlement_type, version_code, precedence_rank, parts_covered, labour_covered, claim_quota, sla_hours, exclusions)
      VALUES ($1::entitlement_type, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (entitlement_type, version_code) DO UPDATE SET precedence_rank = EXCLUDED.precedence_rank
      RETURNING id, entitlement_type;
    `, [t.type, t.version, t.rank, t.parts, t.labour, t.quota, t.sla, t.exclusions]);
    termsIds[t.type] = res.rows[0].id;
  }

  // 5. Units & Entitlements
  // Ensure clean slate for entitlements and enforce uniqueness per unit + entitlement type
  await db.query(`DELETE FROM service_invoices;`);
  await db.query(`DELETE FROM part_reservations;`);
  await db.query(`DELETE FROM service_jobs;`);
  await db.query(`DELETE FROM complaints;`);
  await db.query(`DELETE FROM entitlements;`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_entitlement_unique ON entitlements (unit_id, entitlement_type);`);

  // Unit A: Rohan's TV - Active Manufacturer Warranty AND AMC Comprehensive
  const uA = await db.query(`
    INSERT INTO units (serial_number, model_id, owner_id, purchase_date, purchase_proof_url, registration_state)
    VALUES ('SN-TV-882190', $1, $2, '2025-01-10', 'https://storage.coverflow.com/proofs/tv-882190.pdf', 'REGISTERED')
    ON CONFLICT (serial_number) DO UPDATE SET registration_state = 'REGISTERED'
    RETURNING id;
  `, [modelIds['TV-OLED-65X'], userIds['customer@coverflow.com']]);
  const unitAId = uA.rows[0].id;

  // Add Manufacturer Warranty (1 yr)
  await db.query(`
    INSERT INTO entitlements (unit_id, terms_version_id, entitlement_type, start_date, end_date, claim_quota, claims_used, status)
    VALUES ($1, $2, 'MANUFACTURER_WARRANTY', '2025-01-10', '2027-01-10', 1, 0, 'ACTIVE')
    ON CONFLICT (unit_id, entitlement_type) DO UPDATE SET
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      claim_quota = EXCLUDED.claim_quota,
      claims_used = EXCLUDED.claims_used,
      status = EXCLUDED.status;
  `, [unitAId, termsIds['MANUFACTURER_WARRANTY']]);

  // Add AMC Comprehensive (Rank 1 precedence)
  await db.query(`
    INSERT INTO entitlements (unit_id, terms_version_id, entitlement_type, start_date, end_date, claim_quota, claims_used, status)
    VALUES ($1, $2, 'AMC_COMPREHENSIVE', '2025-06-01', '2027-06-01', 10, 0, 'ACTIVE')
    ON CONFLICT (unit_id, entitlement_type) DO UPDATE SET
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      claim_quota = EXCLUDED.claim_quota,
      claims_used = EXCLUDED.claims_used,
      status = EXCLUDED.status;
  `, [unitAId, termsIds['AMC_COMPREHENSIVE']]);

  // Unit B: Rohan's Laptop - In Grace Window (Ended 5 days ago, within 15-day grace)
  const uB = await db.query(`
    INSERT INTO units (serial_number, model_id, owner_id, purchase_date, purchase_proof_url, registration_state)
    VALUES ('SN-MBP-991204', $1, $2, '2024-05-15', 'https://storage.coverflow.com/proofs/mbp-991204.pdf', 'REGISTERED')
    ON CONFLICT (serial_number) DO UPDATE SET registration_state = 'REGISTERED'
    RETURNING id;
  `, [modelIds['LAP-MBP-16M3'], userIds['customer@coverflow.com']]);
  const unitBId = uB.rows[0].id;

  await db.query(`
    INSERT INTO entitlements (unit_id, terms_version_id, entitlement_type, start_date, end_date, claim_quota, claims_used, status)
    VALUES ($1, $2, 'AMC_LABOUR_ONLY', '2025-01-01', CURRENT_DATE - INTERVAL '5 days', 5, 1, 'GRACE')
    ON CONFLICT (unit_id, entitlement_type) DO UPDATE SET
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      claim_quota = EXCLUDED.claim_quota,
      claims_used = EXCLUDED.claims_used,
      status = EXCLUDED.status;
  `, [unitBId, termsIds['AMC_LABOUR_ONLY']]);

  // Unit C: Rohan's Phone - Extended Warranty with Quota Exhausted
  const uC = await db.query(`
    INSERT INTO units (serial_number, model_id, owner_id, purchase_date, purchase_proof_url, registration_state)
    VALUES ('SN-IP15-110293', $1, $2, '2025-02-20', 'https://storage.coverflow.com/proofs/ip15-110293.pdf', 'REGISTERED')
    ON CONFLICT (serial_number) DO UPDATE SET registration_state = 'REGISTERED'
    RETURNING id;
  `, [modelIds['PHN-IP15P-256'], userIds['customer@coverflow.com']]);
  const unitCId = uC.rows[0].id;

  await db.query(`
    INSERT INTO entitlements (unit_id, terms_version_id, entitlement_type, start_date, end_date, claim_quota, claims_used, status)
    VALUES ($1, $2, 'EXTENDED_WARRANTY', '2025-02-20', '2027-02-20', 2, 2, 'ACTIVE')
    ON CONFLICT (unit_id, entitlement_type) DO UPDATE SET
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      claim_quota = EXCLUDED.claim_quota,
      claims_used = EXCLUDED.claims_used,
      status = EXCLUDED.status;
  `, [unitCId, termsIds['EXTENDED_WARRANTY']]);

  // Unit D: Rohan's Refrigerator - Active 1-Year Manufacturer Warranty
  const uD = await db.query(`
    INSERT INTO units (serial_number, model_id, owner_id, purchase_date, purchase_proof_url, registration_state)
    VALUES ('SN-REF-0609', $1, $2, '2025-06-15', 'https://storage.coverflow.com/proofs/ref-0609.pdf', 'REGISTERED')
    ON CONFLICT (serial_number) DO UPDATE SET registration_state = 'REGISTERED'
    RETURNING id;
  `, [modelIds['REF-INV-550'], userIds['customer@coverflow.com']]);
  const unitDId = uD.rows[0].id;

  await db.query(`
    INSERT INTO entitlements (unit_id, terms_version_id, entitlement_type, start_date, end_date, claim_quota, claims_used, status)
    VALUES ($1, $2, 'MANUFACTURER_WARRANTY', '2025-06-15', '2027-06-15', 2, 0, 'ACTIVE')
    ON CONFLICT (unit_id, entitlement_type) DO UPDATE SET
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      claim_quota = EXCLUDED.claim_quota,
      claims_used = EXCLUDED.claims_used,
      status = EXCLUDED.status;
  `, [unitDId, termsIds['MANUFACTURER_WARRANTY']]);

  // 6. Spare Parts
  const parts = [
    { code: 'DISP-OLED-65', name: '65" OLED Panel Assembly', category: 'Display', cost: 280.00, stock: 12, reserved: 0 },
    { code: 'PWR-BRD-SONY', name: 'Main Power Distribution Board', category: 'Electronics', cost: 75.00, stock: 4, reserved: 0 },
    { code: 'MBP-M3-LOGIC', name: 'M3 Max 36GB Logic Board', category: 'Motherboard', cost: 490.00, stock: 2, reserved: 0 },
    { code: 'IP15-BATT-OEM', name: 'OEM Replacement Battery 3349mAh', category: 'Battery', cost: 45.00, stock: 25, reserved: 0 },
    { code: 'SPARE-RARE-01', name: 'Limited Rare Capacitive Controller', category: 'Sensors', cost: 120.00, stock: 1, reserved: 0 },
    { code: 'REF-COMP-INV', name: 'Smart Inverter Compressor Motor', category: 'Compressor', cost: 145.00, stock: 8, reserved: 0 },
    { code: 'REF-THERM-DEF', name: 'Digital Defrost Thermostat & Sensor', category: 'Sensors', cost: 35.00, stock: 15, reserved: 0 },
    { code: 'REF-EVAP-FAN', name: 'Evaporator Cooling Fan Assembly', category: 'Cooling', cost: 55.00, stock: 10, reserved: 0 },
    { code: 'REF-DOOR-GSK', name: 'Magnetic Door Gasket Seal', category: 'Gaskets', cost: 28.00, stock: 12, reserved: 0 }
  ];

  for (const p of parts) {
    await db.query(`
      INSERT INTO parts (part_code, name, category, unit_cost, stock_on_hand, reserved_quantity, min_threshold)
      VALUES ($1, $2, $3, $4, $5, $6, 3)
      ON CONFLICT (part_code) DO UPDATE SET stock_on_hand = EXCLUDED.stock_on_hand;
    `, [p.code, p.name, p.category, p.cost, p.stock, p.reserved]);
  }

  // 7. Reset & Clean Queues for Demonstration (Clean slate with 3 curated tickets)
  console.log('🧹 Purging historical test jobs to establish a clean demonstration queue...');
  await db.query(`DELETE FROM service_invoices;`);
  await db.query(`DELETE FROM part_reservations;`);
  await db.query(`DELETE FROM service_jobs;`);
  await db.query(`DELETE FROM complaints;`);

  // Remove temporary benchmark/concurrency test units
  await db.query(`DELETE FROM entitlements WHERE unit_id IN (SELECT id FROM units WHERE serial_number LIKE 'SN-TEST%' OR serial_number LIKE 'SN-RACE%');`);
  await db.query(`DELETE FROM units WHERE serial_number LIKE 'SN-TEST%' OR serial_number LIKE 'SN-RACE%';`);

  // Reset reserved parts & quotas
  await db.query(`UPDATE parts SET reserved_quantity = 0;`);
  await db.query(`UPDATE entitlements SET claims_used = 0 WHERE status = 'ACTIVE' AND id NOT IN (SELECT id FROM entitlements WHERE entitlement_type = 'EXTENDED_WARRANTY' AND unit_id = $1);`, [unitCId]);

  const { ComplaintService } = await import('../services/complaint.service');

  // Curated Ticket 1: Bravia 65" TV (Active AMC Comprehensive - SLA Breached to showcase Breach-First priority)
  const comp1 = await ComplaintService.registerAndAdjudicate({
    unit_id: unitAId,
    customer_id: userIds['customer@coverflow.com'],
    fault_category: 'DISPLAY_FLICKER',
    description: 'Screen randomly flickers when displaying dark content',
    branch_id: branchId
  });

  // Set Ticket 1 to Breached (Due 2 hours ago)
  await db.query(`
    UPDATE service_jobs 
    SET due_at = NOW() - INTERVAL '2 hours',
        is_sla_breached = TRUE,
        status = 'QUEUED',
        technician_id = NULL
    WHERE complaint_id = $1;
  `, [comp1.complaint.id]);

  // Curated Ticket 2: MacBook Pro 16" (AMC Labour-Only in Grace Window - Due soon)
  const comp2 = await ComplaintService.registerAndAdjudicate({
    unit_id: unitBId,
    customer_id: userIds['customer@coverflow.com'],
    fault_category: 'BATTERY_DRAIN',
    description: 'Battery drops rapidly from 80% to 20% in 15 minutes',
    branch_id: branchId
  });

  await db.query(`
    UPDATE service_jobs 
    SET due_at = NOW() + INTERVAL '4 hours',
        is_sla_breached = FALSE,
        status = 'QUEUED',
        technician_id = NULL
    WHERE complaint_id = $1;
  `, [comp2.complaint.id]);

  // Curated Ticket 3: Smart Inverter Refrigerator (Manufacturer Warranty - Normal priority)
  const comp3 = await ComplaintService.registerAndAdjudicate({
    unit_id: unitDId,
    customer_id: userIds['customer@coverflow.com'],
    fault_category: 'COOLING_FAILURE',
    description: 'Refrigerator compartment not cooling below 12C, compressor warm to touch',
    branch_id: branchId
  });

  await db.query(`
    UPDATE service_jobs 
    SET due_at = NOW() + INTERVAL '24 hours',
        is_sla_breached = FALSE,
        status = 'QUEUED',
        technician_id = NULL
    WHERE complaint_id = $1;
  `, [comp3.complaint.id]);

  console.log('✅ Database seeded with demo branches, users, models, terms versions, units, and inventory!');
}

if (require.main === module) {
  runSeeds()
    .then(async () => {
      await db.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Fatal seed failure:', err);
      await db.close();
      process.exit(1);
    });
}
