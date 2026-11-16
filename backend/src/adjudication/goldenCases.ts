import { AdjudicationContext, AdjudicationOutcome, EntitlementCandidate } from './types';

export interface GoldenTestCase {
  id: string;
  name: string;
  category: string;
  context: AdjudicationContext;
  expected: {
    outcome: AdjudicationOutcome;
    reason_code: string;
    parts_covered?: boolean;
    labour_covered?: boolean;
    chosen_type?: string;
  };
}

// Reusable mock entitlement builder
function makeEntitlement(
  id: string,
  type: EntitlementCandidate['entitlement_type'],
  options: Partial<EntitlementCandidate> = {}
): EntitlementCandidate {
  const defaults: Record<EntitlementCandidate['entitlement_type'], { rank: number; parts: boolean; labour: boolean; quota: number; sla: number; exclusions: string[] }> = {
    AMC_COMPREHENSIVE: { rank: 1, parts: true, labour: true, quota: 10, sla: 4, exclusions: ['PHYSICAL_DAMAGE', 'LIQUID_SPILL'] },
    AMC_LABOUR_ONLY: { rank: 2, parts: false, labour: true, quota: 5, sla: 8, exclusions: ['PHYSICAL_DAMAGE'] },
    EXTENDED_WARRANTY: { rank: 3, parts: true, labour: true, quota: 2, sla: 24, exclusions: ['COSMETIC_DAMAGE'] },
    MANUFACTURER_WARRANTY: { rank: 4, parts: true, labour: true, quota: 1, sla: 48, exclusions: ['WEAR_AND_TEAR', 'ACCIDENTAL_DROP'] }
  };

  const def = defaults[type];

  return {
    id,
    entitlement_type: type,
    terms_version_id: `terms-${type.toLowerCase()}-v1`,
    version_code: 'v1.0',
    precedence_rank: def.rank,
    start_date: '2025-01-01',
    end_date: '2026-12-31',
    grace_window_days: 15,
    status: 'ACTIVE',
    claim_quota: def.quota,
    claims_used: 0,
    parts_covered: def.parts,
    labour_covered: def.labour,
    sla_hours: def.sla,
    exclusions: [...def.exclusions],
    ...options
  };
}

export const GOLDEN_CASES: GoldenTestCase[] = [
  // ==========================================
  // CATEGORY 1: PRECEDENCE LADDER HIERARCHY (G-01 to G-12)
  // ==========================================
  {
    id: 'G-01',
    name: 'Single Manufacturer Warranty Active',
    category: 'Precedence',
    context: {
      unit_id: 'unit-01',
      registration_state: 'REGISTERED',
      fault_category: 'ELECTRICAL_FAULT',
      fault_date: '2025-06-15',
      entitlements: [makeEntitlement('e1', 'MANUFACTURER_WARRANTY')]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_MANUFACTURER_WARRANTY',
      parts_covered: true,
      labour_covered: true
    }
  },
  {
    id: 'G-02',
    name: 'Single Extended Warranty Active',
    category: 'Precedence',
    context: {
      unit_id: 'unit-02',
      registration_state: 'REGISTERED',
      fault_category: 'ELECTRICAL_FAULT',
      fault_date: '2025-06-15',
      entitlements: [makeEntitlement('e2', 'EXTENDED_WARRANTY')]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_EXTENDED_WARRANTY'
    }
  },
  {
    id: 'G-03',
    name: 'Single AMC Labour Only Active',
    category: 'Precedence',
    context: {
      unit_id: 'unit-03',
      registration_state: 'REGISTERED',
      fault_category: 'ELECTRICAL_FAULT',
      fault_date: '2025-06-15',
      entitlements: [makeEntitlement('e3', 'AMC_LABOUR_ONLY')]
    },
    expected: {
      outcome: 'PARTIAL',
      reason_code: 'PRECEDENCE_AMC_LABOUR_ONLY',
      parts_covered: false,
      labour_covered: true
    }
  },
  {
    id: 'G-04',
    name: 'Single AMC Comprehensive Active',
    category: 'Precedence',
    context: {
      unit_id: 'unit-04',
      registration_state: 'REGISTERED',
      fault_category: 'ELECTRICAL_FAULT',
      fault_date: '2025-06-15',
      entitlements: [makeEntitlement('e4', 'AMC_COMPREHENSIVE')]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_AMC_COMPREHENSIVE'
    }
  },
  {
    id: 'G-05',
    name: 'All 4 Entitlements Active -> Chooses AMC Comprehensive (Rank 1)',
    category: 'Precedence',
    context: {
      unit_id: 'unit-05',
      registration_state: 'REGISTERED',
      fault_category: 'MAIN_BOARD_FAILURE',
      fault_date: '2025-06-15',
      entitlements: [
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY'),
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY'),
        makeEntitlement('e-lab', 'AMC_LABOUR_ONLY'),
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE')
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_AMC_COMPREHENSIVE'
    }
  },
  {
    id: 'G-06',
    name: 'Labour-only AMC vs Extended Warranty -> Chooses Labour-only (Rank 2 over Rank 3)',
    category: 'Precedence',
    context: {
      unit_id: 'unit-06',
      registration_state: 'REGISTERED',
      fault_category: 'SENSOR_MALFUNCTION',
      fault_date: '2025-06-15',
      entitlements: [
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY'),
        makeEntitlement('e-lab', 'AMC_LABOUR_ONLY')
      ]
    },
    expected: {
      outcome: 'PARTIAL',
      reason_code: 'PRECEDENCE_AMC_LABOUR_ONLY'
    }
  },
  {
    id: 'G-07',
    name: 'Manufacturer Warranty active, AMC comprehensive active (Report Case G-07)',
    category: 'Precedence',
    context: {
      unit_id: 'unit-07',
      registration_state: 'REGISTERED',
      fault_category: 'DISPLAY_FLICKER',
      fault_date: '2025-08-10',
      entitlements: [
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY'),
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE')
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_AMC_COMPREHENSIVE'
    }
  },
  {
    id: 'G-08',
    name: 'Extended Warranty vs Manufacturer Warranty -> Chooses Extended Warranty (Rank 3 over Rank 4)',
    category: 'Precedence',
    context: {
      unit_id: 'unit-08',
      registration_state: 'REGISTERED',
      fault_category: 'SPEAKER_DISTORTION',
      fault_date: '2025-04-12',
      entitlements: [
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY'),
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY')
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_EXTENDED_WARRANTY'
    }
  },
  {
    id: 'G-09',
    name: 'AMC Comprehensive vs AMC Labour-Only -> Chooses Comprehensive (Rank 1 over Rank 2)',
    category: 'Precedence',
    context: {
      unit_id: 'unit-09',
      registration_state: 'REGISTERED',
      fault_category: 'BATTERY_DRAIN',
      fault_date: '2025-05-18',
      entitlements: [
        makeEntitlement('e-lab', 'AMC_LABOUR_ONLY'),
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE')
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_AMC_COMPREHENSIVE'
    }
  },
  {
    id: 'G-10',
    name: 'Cancelled AMC comprehensive -> skips to active Extended Warranty',
    category: 'Precedence',
    context: {
      unit_id: 'unit-10',
      registration_state: 'REGISTERED',
      fault_category: 'CHARGING_PORT_DEFECT',
      fault_date: '2025-05-20',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE', { status: 'CANCELLED' }),
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY')
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_EXTENDED_WARRANTY'
    }
  },
  {
    id: 'G-11',
    name: 'Lapsed AMC -> skips to active Manufacturer Warranty',
    category: 'Precedence',
    context: {
      unit_id: 'unit-11',
      registration_state: 'REGISTERED',
      fault_category: 'FAN_NOISE',
      fault_date: '2025-07-01',
      entitlements: [
        makeEntitlement('e-amc', 'AMC_COMPREHENSIVE', { status: 'LAPSED' }),
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY')
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_MANUFACTURER_WARRANTY'
    }
  },
  {
    id: 'G-12',
    name: 'Extended warranty with 1 claim left, AMC labour-only active (Report Case G-12)',
    category: 'Precedence',
    context: {
      unit_id: 'unit-12',
      registration_state: 'REGISTERED',
      fault_category: 'KEYBOARD_UNRESPONSIVE',
      fault_date: '2025-09-02',
      entitlements: [
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { claim_quota: 2, claims_used: 1 }),
        makeEntitlement('e-lab', 'AMC_LABOUR_ONLY')
      ]
    },
    expected: {
      outcome: 'PARTIAL',
      reason_code: 'PRECEDENCE_AMC_LABOUR_ONLY'
    }
  },

  // ==========================================
  // CATEGORY 2: QUOTA EXHAUSTION & TIE-BREAKER (G-13 to G-24)
  // ==========================================
  {
    id: 'G-13',
    name: 'AMC Comprehensive quota exhausted -> Falls back to Extended Warranty',
    category: 'Quota',
    context: {
      unit_id: 'unit-13',
      registration_state: 'REGISTERED',
      fault_category: 'POWER_SUPPLY_ISSUE',
      fault_date: '2025-06-10',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE', { claim_quota: 3, claims_used: 3 }),
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { claim_quota: 2, claims_used: 0 })
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_EXTENDED_WARRANTY'
    }
  },
  {
    id: 'G-14',
    name: 'Tie-break between equal rank: Selects narrower remaining quota (1 left vs 3 left)',
    category: 'Quota',
    context: {
      unit_id: 'unit-14',
      registration_state: 'REGISTERED',
      fault_category: 'SCREEN_GLITCH',
      fault_date: '2025-06-10',
      entitlements: [
        makeEntitlement('e-ext-wide', 'EXTENDED_WARRANTY', { claim_quota: 5, claims_used: 2 }), // 3 left
        makeEntitlement('e-ext-tight', 'EXTENDED_WARRANTY', { claim_quota: 2, claims_used: 1 })  // 1 left
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_EXTENDED_WARRANTY'
    }
  },
  {
    id: 'G-15',
    name: 'Manufacturer Warranty single claim quota used (1/1) -> CHARGEABLE',
    category: 'Quota',
    context: {
      unit_id: 'unit-15',
      registration_state: 'REGISTERED',
      fault_category: 'OVERHEATING',
      fault_date: '2025-06-10',
      entitlements: [
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY', { claim_quota: 1, claims_used: 1 })
      ]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'QUOTA_EXHAUSTED'
    }
  },
  {
    id: 'G-16',
    name: 'Extended warranty quota 2/2 exhausted, no other cover -> CHARGEABLE',
    category: 'Quota',
    context: {
      unit_id: 'unit-16',
      registration_state: 'REGISTERED',
      fault_category: 'CAMERA_BLUR',
      fault_date: '2025-06-10',
      entitlements: [
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { claim_quota: 2, claims_used: 2 })
      ]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'QUOTA_EXHAUSTED'
    }
  },
  {
    id: 'G-17',
    name: 'AMC Comprehensive with 10/10 claims used -> Quota exhausted drops to Labour Only',
    category: 'Quota',
    context: {
      unit_id: 'unit-17',
      registration_state: 'REGISTERED',
      fault_category: 'WIFI_DISCONNECT',
      fault_date: '2025-06-10',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE', { claim_quota: 10, claims_used: 10 }),
        makeEntitlement('e-lab', 'AMC_LABOUR_ONLY', { claim_quota: 5, claims_used: 2 })
      ]
    },
    expected: {
      outcome: 'PARTIAL',
      reason_code: 'PRECEDENCE_AMC_LABOUR_ONLY'
    }
  },
  {
    id: 'G-18',
    name: 'AMC comprehensive active, fault is physical damage (Report Case G-18)',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-18',
      registration_state: 'REGISTERED',
      fault_category: 'PHYSICAL_DAMAGE',
      fault_date: '2025-06-10',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE')
      ]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'EXCLUDED_PHYSICAL_DAMAGE'
    }
  },
  {
    id: 'G-19',
    name: 'All active entitlements have exhausted quotas -> CHARGEABLE',
    category: 'Quota',
    context: {
      unit_id: 'unit-19',
      registration_state: 'REGISTERED',
      fault_category: 'AUDIO_JACK_LOOSE',
      fault_date: '2025-06-10',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE', { claim_quota: 2, claims_used: 2 }),
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { claim_quota: 1, claims_used: 1 }),
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY', { claim_quota: 1, claims_used: 1 })
      ]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'QUOTA_EXHAUSTED'
    }
  },
  {
    id: 'G-20',
    name: 'Extended warranty quota 1 of 2 used -> Allowed',
    category: 'Quota',
    context: {
      unit_id: 'unit-20',
      registration_state: 'REGISTERED',
      fault_category: 'INTERNAL_COMPONENT_FAULT',
      fault_date: '2025-06-10',
      entitlements: [
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { claim_quota: 2, claims_used: 1 })
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_EXTENDED_WARRANTY'
    }
  },
  {
    id: 'G-21',
    name: 'AMC comprehensive quota 9 of 10 used -> Allowed (Last available claim)',
    category: 'Quota',
    context: {
      unit_id: 'unit-21',
      registration_state: 'REGISTERED',
      fault_category: 'TRACKPAD_FAILURE',
      fault_date: '2025-06-10',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE', { claim_quota: 10, claims_used: 9 })
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_AMC_COMPREHENSIVE'
    }
  },
  {
    id: 'G-22',
    name: 'Two warranties: Higher precedence quota exhausted, lower precedence has quota',
    category: 'Quota',
    context: {
      unit_id: 'unit-22',
      registration_state: 'REGISTERED',
      fault_category: 'BLUETOOTH_FAILURE',
      fault_date: '2025-06-10',
      entitlements: [
        makeEntitlement('e-lab', 'AMC_LABOUR_ONLY', { claim_quota: 3, claims_used: 3 }),
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY', { claim_quota: 1, claims_used: 0 })
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_MANUFACTURER_WARRANTY'
    }
  },
  {
    id: 'G-23',
    name: 'Extended warranty quota exhausted, no other cover (Report Case G-23)',
    category: 'Quota',
    context: {
      unit_id: 'unit-23',
      registration_state: 'REGISTERED',
      fault_category: 'TOUCH_SENSOR_INOPERATIVE',
      fault_date: '2025-07-15',
      entitlements: [
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { claim_quota: 1, claims_used: 1 })
      ]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'QUOTA_EXHAUSTED'
    }
  },
  {
    id: 'G-24',
    name: 'Tie-break preserves wider quota for later: Chooses candidate with 2 remaining over 8 remaining',
    category: 'Quota',
    context: {
      unit_id: 'unit-24',
      registration_state: 'REGISTERED',
      fault_category: 'LED_DIMMING',
      fault_date: '2025-07-15',
      entitlements: [
        makeEntitlement('e-comp-large', 'AMC_COMPREHENSIVE', { claim_quota: 10, claims_used: 2 }), // 8 left
        makeEntitlement('e-comp-small', 'AMC_COMPREHENSIVE', { claim_quota: 5, claims_used: 3 })   // 2 left
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_AMC_COMPREHENSIVE'
    }
  },

  // ==========================================
  // CATEGORY 3: EXCLUSIONS & FAULT SPECIFICITY (G-25 to G-36)
  // ==========================================
  {
    id: 'G-25',
    name: 'Liquid spill excluded on AMC Comprehensive, but no other cover -> CHARGEABLE',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-25',
      registration_state: 'REGISTERED',
      fault_category: 'LIQUID_SPILL',
      fault_date: '2025-05-10',
      entitlements: [makeEntitlement('e-comp', 'AMC_COMPREHENSIVE')]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'EXCLUDED_LIQUID_SPILL'
    }
  },
  {
    id: 'G-26',
    name: 'Physical damage excluded on AMC, but covered under Extended Warranty -> Falls back to Extended',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-26',
      registration_state: 'REGISTERED',
      fault_category: 'PHYSICAL_DAMAGE',
      fault_date: '2025-05-10',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE'), // excludes PHYSICAL_DAMAGE
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY')   // does not exclude PHYSICAL_DAMAGE
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_EXTENDED_WARRANTY'
    }
  },
  {
    id: 'G-27',
    name: 'Cosmetic damage excluded on Extended Warranty, falls back to Manufacturer Warranty',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-27',
      registration_state: 'REGISTERED',
      fault_category: 'COSMETIC_DAMAGE',
      fault_date: '2025-05-10',
      entitlements: [
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY'),   // excludes COSMETIC_DAMAGE
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY') // does not exclude COSMETIC_DAMAGE
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_MANUFACTURER_WARRANTY'
    }
  },
  {
    id: 'G-28',
    name: 'Wear and tear excluded on Manufacturer warranty, but covered on AMC Comprehensive',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-28',
      registration_state: 'REGISTERED',
      fault_category: 'WEAR_AND_TEAR',
      fault_date: '2025-05-10',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE'),
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY')
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_AMC_COMPREHENSIVE'
    }
  },
  {
    id: 'G-29',
    name: 'Accidental drop excluded on Manufacturer warranty, only cover present -> CHARGEABLE',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-29',
      registration_state: 'REGISTERED',
      fault_category: 'ACCIDENTAL_DROP',
      fault_date: '2025-05-10',
      entitlements: [makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY')]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'EXCLUDED_ACCIDENTAL_DROP'
    }
  },
  {
    id: 'G-30',
    name: 'Physical damage excluded on Labour-only AMC, no other cover -> CHARGEABLE',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-30',
      registration_state: 'REGISTERED',
      fault_category: 'PHYSICAL_DAMAGE',
      fault_date: '2025-05-10',
      entitlements: [makeEntitlement('e-lab', 'AMC_LABOUR_ONLY')]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'EXCLUDED_PHYSICAL_DAMAGE'
    }
  },
  {
    id: 'G-31',
    name: 'AMC in grace window, fault reported on day 9 of grace (Report Case G-31)',
    category: 'Grace',
    context: {
      unit_id: 'unit-31',
      registration_state: 'REGISTERED',
      fault_category: 'SPEAKER_CRACKLE',
      fault_date: '2025-07-09',
      entitlements: [
        makeEntitlement('e-amc-grace', 'AMC_COMPREHENSIVE', {
          start_date: '2024-06-30',
          end_date: '2025-06-30',
          status: 'GRACE',
          grace_window_days: 15
        })
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'GRACE_WINDOW_HONOURED'
    }
  },
  {
    id: 'G-32',
    name: 'Case insensitivity & hyphen normalization in exclusion evaluation',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-32',
      registration_state: 'REGISTERED',
      fault_category: 'physical-damage', // lower case with hyphen
      fault_date: '2025-05-10',
      entitlements: [makeEntitlement('e-comp', 'AMC_COMPREHENSIVE')]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'EXCLUDED_PHYSICAL_DAMAGE'
    }
  },
  {
    id: 'G-33',
    name: 'Multiple exclusions on terms: liquid spill on AMC comprehensive',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-33',
      registration_state: 'REGISTERED',
      fault_category: 'LIQUID_SPILL',
      fault_date: '2025-05-10',
      entitlements: [makeEntitlement('e-comp', 'AMC_COMPREHENSIVE')]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'EXCLUDED_LIQUID_SPILL'
    }
  },
  {
    id: 'G-34',
    name: 'Liquid spill excluded on both AMC Comprehensive and Manufacturer Warranty -> CHARGEABLE',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-34',
      registration_state: 'REGISTERED',
      fault_category: 'LIQUID_SPILL',
      fault_date: '2025-05-10',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE'),
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY', { exclusions: ['LIQUID_SPILL'] })
      ]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'EXCLUDED_LIQUID_SPILL'
    }
  },
  {
    id: 'G-35',
    name: 'Exclusion on Rank 1, but Rank 2 covers it -> Selects Rank 2 Partial',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-35',
      registration_state: 'REGISTERED',
      fault_category: 'LIQUID_SPILL',
      fault_date: '2025-05-10',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE', { exclusions: ['LIQUID_SPILL'] }),
        makeEntitlement('e-lab', 'AMC_LABOUR_ONLY', { exclusions: [] }) // does not exclude liquid spill
      ]
    },
    expected: {
      outcome: 'PARTIAL',
      reason_code: 'PRECEDENCE_AMC_LABOUR_ONLY'
    }
  },
  {
    id: 'G-36',
    name: 'Non-excluded internal electrical defect on all plans -> Selects highest rank (Comprehensive)',
    category: 'Exclusion',
    context: {
      unit_id: 'unit-36',
      registration_state: 'REGISTERED',
      fault_category: 'TRANSISTOR_BLOWN',
      fault_date: '2025-05-10',
      entitlements: [
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY'),
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE')
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_AMC_COMPREHENSIVE'
    }
  },

  // ==========================================
  // CATEGORY 4: BOUNDARY DATES & EXPIRATION (G-37 to G-46)
  // ==========================================
  {
    id: 'G-37',
    name: 'Fault on exact start date of warranty -> COVERED',
    category: 'Boundary',
    context: {
      unit_id: 'unit-37',
      registration_state: 'REGISTERED',
      fault_category: 'DEAD_ON_ARRIVAL',
      fault_date: '2025-01-01',
      entitlements: [makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY', { start_date: '2025-01-01', end_date: '2026-01-01' })]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_MANUFACTURER_WARRANTY'
    }
  },
  {
    id: 'G-38',
    name: 'Fault 1 day before start date -> Not active -> CHARGEABLE',
    category: 'Boundary',
    context: {
      unit_id: 'unit-38',
      registration_state: 'REGISTERED',
      fault_category: 'POWER_FAILURE',
      fault_date: '2024-12-31',
      entitlements: [makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY', { start_date: '2025-01-01', end_date: '2026-01-01' })]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'NO_ACTIVE_COVER'
    }
  },
  {
    id: 'G-39',
    name: 'Fault on exact last day of Extended Warranty -> BOUNDARY_LAST_DAY_INCLUSIVE',
    category: 'Boundary',
    context: {
      unit_id: 'unit-39',
      registration_state: 'REGISTERED',
      fault_category: 'BATTERY_FAILURE',
      fault_date: '2026-12-31',
      entitlements: [makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { start_date: '2025-01-01', end_date: '2026-12-31' })]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'BOUNDARY_LAST_DAY_INCLUSIVE'
    }
  },
  {
    id: 'G-40',
    name: 'Fault 1 day after Extended Warranty end date (No grace on warranty) -> CHARGEABLE',
    category: 'Boundary',
    context: {
      unit_id: 'unit-40',
      registration_state: 'REGISTERED',
      fault_category: 'BATTERY_FAILURE',
      fault_date: '2027-01-01',
      entitlements: [makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { start_date: '2025-01-01', end_date: '2026-12-31' })]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'NO_ACTIVE_COVER'
    }
  },
  {
    id: 'G-41',
    name: 'Fault midway through 2-year warranty term -> Valid COVERED',
    category: 'Boundary',
    context: {
      unit_id: 'unit-41',
      registration_state: 'REGISTERED',
      fault_category: 'HINGE_NOISE',
      fault_date: '2025-12-15',
      entitlements: [makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { start_date: '2025-01-01', end_date: '2026-12-31' })]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_EXTENDED_WARRANTY'
    }
  },
  {
    id: 'G-42',
    name: 'Fault date long after warranty expiry (2 months after) -> CHARGEABLE',
    category: 'Boundary',
    context: {
      unit_id: 'unit-42',
      registration_state: 'REGISTERED',
      fault_category: 'DISPLAY_BURNOUT',
      fault_date: '2027-03-01',
      entitlements: [makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY', { start_date: '2025-01-01', end_date: '2026-12-31' })]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'NO_ACTIVE_COVER'
    }
  },
  {
    id: 'G-43',
    name: 'Fault on exact last day of AMC Comprehensive -> BOUNDARY_LAST_DAY_INCLUSIVE',
    category: 'Boundary',
    context: {
      unit_id: 'unit-43',
      registration_state: 'REGISTERED',
      fault_category: 'MOTOR_NOISE',
      fault_date: '2026-06-30',
      entitlements: [makeEntitlement('e-comp', 'AMC_COMPREHENSIVE', { start_date: '2025-07-01', end_date: '2026-06-30' })]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'BOUNDARY_LAST_DAY_INCLUSIVE'
    }
  },
  {
    id: 'G-44',
    name: 'Manufacturer warranty ends today, fault reported today (Report Case G-44)',
    category: 'Boundary',
    context: {
      unit_id: 'unit-44',
      registration_state: 'REGISTERED',
      fault_category: 'SPEAKER_MUTE',
      fault_date: '2025-11-04',
      entitlements: [makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY', { start_date: '2024-11-04', end_date: '2025-11-04' })]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'BOUNDARY_LAST_DAY_INCLUSIVE'
    }
  },
  {
    id: 'G-45',
    name: 'Old expired warranty + Fresh active warranty -> Selects active warranty',
    category: 'Boundary',
    context: {
      unit_id: 'unit-45',
      registration_state: 'REGISTERED',
      fault_category: 'POWER_LED_BLINKING',
      fault_date: '2026-02-01',
      entitlements: [
        makeEntitlement('e-mfg-old', 'MANUFACTURER_WARRANTY', { start_date: '2024-01-01', end_date: '2025-01-01' }),
        makeEntitlement('e-ext-new', 'EXTENDED_WARRANTY', { start_date: '2025-01-02', end_date: '2027-01-02' })
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_EXTENDED_WARRANTY'
    }
  },
  {
    id: 'G-46',
    name: 'Empty entitlements array -> CHARGEABLE NO_ACTIVE_COVER',
    category: 'Boundary',
    context: {
      unit_id: 'unit-46',
      registration_state: 'REGISTERED',
      fault_category: 'CASING_CRACK',
      fault_date: '2025-05-15',
      entitlements: []
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'NO_ACTIVE_COVER'
    }
  },

  // ==========================================
  // CATEGORY 5: AMC GRACE WINDOW HANDLING (G-47 to G-54)
  // ==========================================
  {
    id: 'G-47',
    name: 'AMC Comprehensive: Fault on Day 1 of 15-day Grace Window -> GRACE_WINDOW_HONOURED',
    category: 'Grace',
    context: {
      unit_id: 'unit-47',
      registration_state: 'REGISTERED',
      fault_category: 'PCB_SHORT',
      fault_date: '2025-07-01',
      entitlements: [
        makeEntitlement('e-amc', 'AMC_COMPREHENSIVE', {
          start_date: '2024-07-01',
          end_date: '2025-06-30',
          grace_window_days: 15
        })
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'GRACE_WINDOW_HONOURED'
    }
  },
  {
    id: 'G-48',
    name: 'AMC Comprehensive: Fault on Day 14 of 15-day Grace Window -> GRACE_WINDOW_HONOURED',
    category: 'Grace',
    context: {
      unit_id: 'unit-48',
      registration_state: 'REGISTERED',
      fault_category: 'FAN_FAILURE',
      fault_date: '2025-07-14',
      entitlements: [
        makeEntitlement('e-amc', 'AMC_COMPREHENSIVE', {
          start_date: '2024-07-01',
          end_date: '2025-06-30',
          grace_window_days: 15
        })
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'GRACE_WINDOW_HONOURED'
    }
  },
  {
    id: 'G-49',
    name: 'AMC Comprehensive: Fault on Day 15 of Grace Window (Exact Grace Boundary) -> GRACE_WINDOW_HONOURED',
    category: 'Grace',
    context: {
      unit_id: 'unit-49',
      registration_state: 'REGISTERED',
      fault_category: 'FAN_FAILURE',
      fault_date: '2025-07-15',
      entitlements: [
        makeEntitlement('e-amc', 'AMC_COMPREHENSIVE', {
          start_date: '2024-07-01',
          end_date: '2025-06-30',
          grace_window_days: 15
        })
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'GRACE_WINDOW_HONOURED'
    }
  },
  {
    id: 'G-50',
    name: 'AMC Comprehensive: Fault on Day 16 (Grace Window Expired) -> CHARGEABLE',
    category: 'Grace',
    context: {
      unit_id: 'unit-50',
      registration_state: 'REGISTERED',
      fault_category: 'FAN_FAILURE',
      fault_date: '2025-07-16',
      entitlements: [
        makeEntitlement('e-amc', 'AMC_COMPREHENSIVE', {
          start_date: '2024-07-01',
          end_date: '2025-06-30',
          grace_window_days: 15
        })
      ]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'NO_ACTIVE_COVER'
    }
  },
  {
    id: 'G-51',
    name: 'AMC Labour Only in Grace Window -> PARTIAL with GRACE_WINDOW_HONOURED',
    category: 'Grace',
    context: {
      unit_id: 'unit-51',
      registration_state: 'REGISTERED',
      fault_category: 'SWITCH_DEFECT',
      fault_date: '2025-07-05',
      entitlements: [
        makeEntitlement('e-lab', 'AMC_LABOUR_ONLY', {
          start_date: '2024-07-01',
          end_date: '2025-06-30',
          grace_window_days: 15
        })
      ]
    },
    expected: {
      outcome: 'PARTIAL',
      reason_code: 'GRACE_WINDOW_HONOURED'
    }
  },
  {
    id: 'G-52',
    name: 'AMC in Grace vs Active Extended Warranty: Active Extended Warranty has active date coverage',
    category: 'Grace',
    context: {
      unit_id: 'unit-52',
      registration_state: 'REGISTERED',
      fault_category: 'WIFI_MODULE_DEFECT',
      fault_date: '2025-07-05',
      entitlements: [
        makeEntitlement('e-amc-grace', 'AMC_COMPREHENSIVE', {
          start_date: '2024-07-01',
          end_date: '2025-06-30',
          grace_window_days: 15
        }),
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY', {
          start_date: '2025-01-01',
          end_date: '2026-12-31'
        })
      ]
    },
    expected: {
      outcome: 'COVERED',
      // Since AMC is rank 1 and within grace window, grace is honoured over lower rank
      reason_code: 'GRACE_WINDOW_HONOURED'
    }
  },
  {
    id: 'G-53',
    name: 'AMC in Grace with Quota Exhausted -> Cannot be honoured in grace -> CHARGEABLE',
    category: 'Grace',
    context: {
      unit_id: 'unit-53',
      registration_state: 'REGISTERED',
      fault_category: 'HEATING_ELEMENT',
      fault_date: '2025-07-05',
      entitlements: [
        makeEntitlement('e-amc-grace', 'AMC_COMPREHENSIVE', {
          start_date: '2024-07-01',
          end_date: '2025-06-30',
          claim_quota: 2,
          claims_used: 2,
          grace_window_days: 15
        })
      ]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'QUOTA_EXHAUSTED'
    }
  },
  {
    id: 'G-54',
    name: 'AMC in Grace with Excluded Fault -> Cannot be honoured in grace -> CHARGEABLE',
    category: 'Grace',
    context: {
      unit_id: 'unit-54',
      registration_state: 'REGISTERED',
      fault_category: 'PHYSICAL_DAMAGE',
      fault_date: '2025-07-05',
      entitlements: [
        makeEntitlement('e-amc-grace', 'AMC_COMPREHENSIVE', {
          start_date: '2024-07-01',
          end_date: '2025-06-30',
          exclusions: ['PHYSICAL_DAMAGE'],
          grace_window_days: 15
        })
      ]
    },
    expected: {
      outcome: 'CHARGEABLE',
      reason_code: 'EXCLUDED_PHYSICAL_DAMAGE'
    }
  },

  // ==========================================
  // CATEGORY 6: REGISTRATION STATES (G-55 to G-58)
  // ==========================================
  {
    id: 'G-55',
    name: 'Unit in PENDING_PROOF state -> UNIT_REGISTRATION_REQUIRED',
    category: 'Registration',
    context: {
      unit_id: 'unit-55',
      registration_state: 'PENDING_PROOF',
      fault_category: 'INTERNAL_DEFECT',
      fault_date: '2025-06-15',
      entitlements: [makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY')]
    },
    expected: {
      outcome: 'NOT_REGISTERED',
      reason_code: 'UNIT_REGISTRATION_REQUIRED'
    }
  },
  {
    id: 'G-56',
    name: 'Unit in REJECTED registration state -> UNIT_REGISTRATION_REQUIRED',
    category: 'Registration',
    context: {
      unit_id: 'unit-56',
      registration_state: 'REJECTED',
      fault_category: 'INTERNAL_DEFECT',
      fault_date: '2025-06-15',
      entitlements: [makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY')]
    },
    expected: {
      outcome: 'NOT_REGISTERED',
      reason_code: 'UNIT_REGISTRATION_REQUIRED'
    }
  },
  {
    id: 'G-57',
    name: 'Unit REGISTERED with valid cover -> Proceeds normally',
    category: 'Registration',
    context: {
      unit_id: 'unit-57',
      registration_state: 'REGISTERED',
      fault_category: 'AUDIO_FAILURE',
      fault_date: '2025-06-15',
      entitlements: [makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY')]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_MANUFACTURER_WARRANTY'
    }
  },
  {
    id: 'G-58',
    name: 'Unit PENDING_PROOF even with active AMC -> Blocked until proof accepted',
    category: 'Registration',
    context: {
      unit_id: 'unit-58',
      registration_state: 'PENDING_PROOF',
      fault_category: 'AUDIO_FAILURE',
      fault_date: '2025-06-15',
      entitlements: [makeEntitlement('e-comp', 'AMC_COMPREHENSIVE')]
    },
    expected: {
      outcome: 'NOT_REGISTERED',
      reason_code: 'UNIT_REGISTRATION_REQUIRED'
    }
  },

  // ==========================================
  // CATEGORY 7: GOODWILL OVERRIDES (G-59 to G-62)
  // ==========================================
  {
    id: 'G-59',
    name: 'Service Manager Goodwill Override on expired policy -> COVERED',
    category: 'Override',
    context: {
      unit_id: 'unit-59',
      registration_state: 'REGISTERED',
      fault_category: 'DISPLAY_FAILURE',
      fault_date: '2025-06-15',
      entitlements: [],
      override: {
        actor_id: 'manager-01',
        reason: 'Customer loyal customer of 10 years, granted 1-time exception'
      }
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'GOODWILL_OVERRIDE_RECORDED'
    }
  },
  {
    id: 'G-60',
    name: 'Service Manager Goodwill Override on excluded liquid spill -> COVERED',
    category: 'Override',
    context: {
      unit_id: 'unit-60',
      registration_state: 'REGISTERED',
      fault_category: 'LIQUID_SPILL',
      fault_date: '2025-06-15',
      entitlements: [makeEntitlement('e-comp', 'AMC_COMPREHENSIVE')],
      override: {
        actor_id: 'manager-01',
        reason: 'Minor splash near keyboard, approved courtesy repair'
      }
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'GOODWILL_OVERRIDE_RECORDED'
    }
  },
  {
    id: 'G-61',
    name: 'Service Manager Goodwill Override on exhausted quota -> COVERED',
    category: 'Override',
    context: {
      unit_id: 'unit-61',
      registration_state: 'REGISTERED',
      fault_category: 'POWER_BOARD_FAILURE',
      fault_date: '2025-06-15',
      entitlements: [makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY', { claim_quota: 1, claims_used: 1 })],
      override: {
        actor_id: 'manager-01',
        reason: 'Repeat repair within 30 days of prior fix'
      }
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'GOODWILL_OVERRIDE_RECORDED'
    }
  },
  {
    id: 'G-62',
    name: 'Manager explicitly grants PARTIAL override',
    category: 'Override',
    context: {
      unit_id: 'unit-62',
      registration_state: 'REGISTERED',
      fault_category: 'SCREEN_CRACK',
      fault_date: '2025-06-15',
      entitlements: [],
      override: {
        actor_id: 'manager-01',
        reason: 'Labour free of charge, parts payable',
        force_outcome: 'PARTIAL'
      }
    },
    expected: {
      outcome: 'PARTIAL',
      reason_code: 'GOODWILL_OVERRIDE_RECORDED'
    }
  },

  // ==========================================
  // CATEGORY 8: COMPLEX MULTI-TIER FALLBACKS (G-63 to G-65)
  // ==========================================
  {
    id: 'G-63',
    name: 'Rank 1 excluded, Rank 2 quota exhausted, Rank 3 valid -> Selects Rank 3 (Extended Warranty)',
    category: 'Complex',
    context: {
      unit_id: 'unit-63',
      registration_state: 'REGISTERED',
      fault_category: 'PHYSICAL_DAMAGE',
      fault_date: '2025-06-15',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE'), // Excludes physical damage
        makeEntitlement('e-lab', 'AMC_LABOUR_ONLY', { claim_quota: 2, claims_used: 2 }), // Quota exhausted
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY')   // Valid!
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_EXTENDED_WARRANTY'
    }
  },
  {
    id: 'G-64',
    name: 'Rank 1, 2, 3 excluded or exhausted, Rank 4 Manufacturer Warranty valid -> Selects Rank 4',
    category: 'Complex',
    context: {
      unit_id: 'unit-64',
      registration_state: 'REGISTERED',
      fault_category: 'COSMETIC_DAMAGE',
      fault_date: '2025-06-15',
      entitlements: [
        makeEntitlement('e-comp', 'AMC_COMPREHENSIVE', { exclusions: ['COSMETIC_DAMAGE'] }),
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { exclusions: ['COSMETIC_DAMAGE'] }),
        makeEntitlement('e-mfg', 'MANUFACTURER_WARRANTY', { exclusions: ['WEAR_AND_TEAR'] }) // Does not exclude cosmetic
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'PRECEDENCE_MANUFACTURER_WARRANTY'
    }
  },
  {
    id: 'G-65',
    name: 'Multiple contracts: Expired warranty + AMC in grace + cancelled extended -> Selects AMC in grace',
    category: 'Complex',
    context: {
      unit_id: 'unit-65',
      registration_state: 'REGISTERED',
      fault_category: 'SPEAKER_NOISE',
      fault_date: '2025-07-08',
      entitlements: [
        makeEntitlement('e-old', 'MANUFACTURER_WARRANTY', { start_date: '2023-01-01', end_date: '2024-01-01' }),
        makeEntitlement('e-amc', 'AMC_COMPREHENSIVE', { start_date: '2024-07-01', end_date: '2025-06-30', grace_window_days: 15 }),
        makeEntitlement('e-ext', 'EXTENDED_WARRANTY', { status: 'CANCELLED' })
      ]
    },
    expected: {
      outcome: 'COVERED',
      reason_code: 'GRACE_WINDOW_HONOURED'
    }
  }
];
