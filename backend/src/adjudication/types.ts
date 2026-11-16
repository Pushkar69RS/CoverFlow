export type EntitlementType =
  | 'AMC_COMPREHENSIVE'
  | 'AMC_LABOUR_ONLY'
  | 'EXTENDED_WARRANTY'
  | 'MANUFACTURER_WARRANTY';

export type RegistrationState = 'REGISTERED' | 'PENDING_PROOF' | 'REJECTED';

export type AdjudicationOutcome = 'COVERED' | 'PARTIAL' | 'CHARGEABLE' | 'NOT_REGISTERED';

export interface EntitlementCandidate {
  id: string;
  entitlement_type: EntitlementType;
  terms_version_id: string;
  version_code: string;
  precedence_rank: number;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  grace_window_days?: number; // default 15
  status: 'ACTIVE' | 'GRACE' | 'LAPSED' | 'EXPIRED' | 'CANCELLED';
  claim_quota: number;
  claims_used: number;
  parts_covered: boolean;
  labour_covered: boolean;
  sla_hours: number;
  exclusions: string[];
}

export interface AdjudicationContext {
  unit_id: string;
  registration_state: RegistrationState;
  fault_category: string;
  fault_date: string; // YYYY-MM-DD
  entitlements: EntitlementCandidate[];
  override?: {
    actor_id: string;
    reason: string;
    force_outcome?: AdjudicationOutcome;
  };
}

export interface AdjudicationResult {
  outcome: AdjudicationOutcome;
  reason_code: string;
  chosen_entitlement_id: string | null;
  terms_version_id: string | null;
  sla_hours: number;
  parts_covered: boolean;
  labour_covered: boolean;
  evaluated_candidates_count: number;
  rejection_reasons: Array<{
    entitlement_id: string;
    type: EntitlementType;
    reason: string;
  }>;
  is_override: boolean;
  override_notes?: string;
}
