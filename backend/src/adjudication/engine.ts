import {
  AdjudicationContext,
  AdjudicationOutcome,
  AdjudicationResult,
  EntitlementCandidate
} from './types';

function parseDateUtc(dateStr: string): number {
  const parts = dateStr.split('T')[0].split('-').map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function addDaysUtc(dateStr: string, days: number): number {
  const ms = parseDateUtc(dateStr);
  return ms + days * 86400000;
}

export function evaluateCoverage(context: AdjudicationContext): AdjudicationResult {
  const rejections: Array<{ entitlement_id: string; type: EntitlementCandidate['entitlement_type']; reason: string }> = [];

  // 1. Check Unit Registration
  if (context.registration_state !== 'REGISTERED') {
    return {
      outcome: 'NOT_REGISTERED',
      reason_code: 'UNIT_REGISTRATION_REQUIRED',
      chosen_entitlement_id: null,
      terms_version_id: null,
      sla_hours: 48,
      parts_covered: false,
      labour_covered: false,
      evaluated_candidates_count: 0,
      rejection_reasons: rejections,
      is_override: false
    };
  }

  // 2. Check Service Manager Goodwill Override
  if (context.override) {
    const outcome: AdjudicationOutcome = context.override.force_outcome || 'COVERED';
    return {
      outcome,
      reason_code: 'GOODWILL_OVERRIDE_RECORDED',
      chosen_entitlement_id: null,
      terms_version_id: null,
      sla_hours: 24,
      parts_covered: outcome === 'COVERED',
      labour_covered: outcome !== 'CHARGEABLE',
      evaluated_candidates_count: 0,
      rejection_reasons: rejections,
      is_override: true,
      override_notes: context.override.reason
    };
  }

  const faultMs = parseDateUtc(context.fault_date);
  const normalizedCategory = context.fault_category.trim().toUpperCase().replace(/[\s-]+/g, '_');

  // 3. Filter candidates active on fault date (including grace window)
  interface EvaluatedCandidate extends EntitlementCandidate {
    isGrace: boolean;
    isLastDay: boolean;
  }

  const activeCandidates: EvaluatedCandidate[] = [];

  for (const ent of context.entitlements) {
    if (ent.status === 'CANCELLED' || ent.status === 'LAPSED') {
      rejections.push({
        entitlement_id: ent.id,
        type: ent.entitlement_type,
        reason: `CONTRACT_${ent.status}`
      });
      continue;
    }

    const startMs = parseDateUtc(ent.start_date);
    const endMs = parseDateUtc(ent.end_date);
    const graceDays = ent.grace_window_days ?? 15;
    const graceEndMs = addDaysUtc(ent.end_date, graceDays);

    if (faultMs < startMs) {
      rejections.push({
        entitlement_id: ent.id,
        type: ent.entitlement_type,
        reason: 'FAULT_BEFORE_COVERAGE_START'
      });
      continue;
    }

    let isLastDay = false;

    if (faultMs <= endMs) {
      // Normal active coverage period
      if (faultMs === endMs) {
        isLastDay = true;
      }
      activeCandidates.push({ ...ent, isGrace: false, isLastDay });
    } else if (faultMs <= graceEndMs && (ent.entitlement_type.startsWith('AMC') || ent.status === 'GRACE')) {
      // Within allowed grace window for AMCs
      activeCandidates.push({ ...ent, isGrace: true, isLastDay: false });
    } else {
      rejections.push({
        entitlement_id: ent.id,
        type: ent.entitlement_type,
        reason: 'COVERAGE_EXPIRED'
      });
    }
  }

  if (activeCandidates.length === 0) {
    return {
      outcome: 'CHARGEABLE',
      reason_code: 'NO_ACTIVE_COVER',
      chosen_entitlement_id: null,
      terms_version_id: null,
      sla_hours: 48,
      parts_covered: false,
      labour_covered: false,
      evaluated_candidates_count: 0,
      rejection_reasons: rejections,
      is_override: false
    };
  }

  // 4. Sort by Precedence Rank ASC, then narrowest remaining quota ASC (Tie-breaker)
  activeCandidates.sort((a, b) => {
    if (a.precedence_rank !== b.precedence_rank) {
      return a.precedence_rank - b.precedence_rank;
    }
    const quotaA = a.claim_quota - a.claims_used;
    const quotaB = b.claim_quota - b.claims_used;
    return quotaA - quotaB;
  });

  // 5. Evaluate exclusions and claim quota in precedence order
  let chosen: EvaluatedCandidate | null = null;
  let primaryRejectionReason = 'NO_APPLICABLE_COVERAGE';

  for (const candidate of activeCandidates) {
    const isExcluded = candidate.exclusions.some(
      ex => ex.trim().toUpperCase().replace(/[\s-]+/g, '_') === normalizedCategory
    );

    if (isExcluded) {
      const reason = `EXCLUDED_${normalizedCategory}`;
      rejections.push({
        entitlement_id: candidate.id,
        type: candidate.entitlement_type,
        reason
      });
      if (primaryRejectionReason === 'NO_APPLICABLE_COVERAGE') {
        primaryRejectionReason = reason;
      }
      continue;
    }

    if (candidate.claims_used >= candidate.claim_quota) {
      rejections.push({
        entitlement_id: candidate.id,
        type: candidate.entitlement_type,
        reason: 'QUOTA_EXHAUSTED'
      });
      if (primaryRejectionReason === 'NO_APPLICABLE_COVERAGE') {
        primaryRejectionReason = 'QUOTA_EXHAUSTED';
      }
      continue;
    }

    // Candidate passed both exclusion check and quota check!
    chosen = candidate;
    break;
  }

  // 6. If no entitlement passed checks, return Chargeable with specific reason
  if (!chosen) {
    return {
      outcome: 'CHARGEABLE',
      reason_code: primaryRejectionReason,
      chosen_entitlement_id: null,
      terms_version_id: null,
      sla_hours: 48,
      parts_covered: false,
      labour_covered: false,
      evaluated_candidates_count: activeCandidates.length,
      rejection_reasons: rejections,
      is_override: false
    };
  }

  // 7. Derive Outcome & Reason Code from chosen entitlement
  let outcome: AdjudicationOutcome;
  if (chosen.parts_covered && chosen.labour_covered) {
    outcome = 'COVERED';
  } else if (chosen.labour_covered && !chosen.parts_covered) {
    outcome = 'PARTIAL';
  } else {
    outcome = 'CHARGEABLE';
  }

  let reasonCode: string;
  if (chosen.isGrace) {
    reasonCode = 'GRACE_WINDOW_HONOURED';
  } else if (chosen.isLastDay) {
    reasonCode = 'BOUNDARY_LAST_DAY_INCLUSIVE';
  } else {
    reasonCode = `PRECEDENCE_${chosen.entitlement_type}`;
  }

  return {
    outcome,
    reason_code: reasonCode,
    chosen_entitlement_id: chosen.id,
    terms_version_id: chosen.terms_version_id,
    sla_hours: chosen.sla_hours,
    parts_covered: chosen.parts_covered,
    labour_covered: chosen.labour_covered,
    evaluated_candidates_count: activeCandidates.length,
    rejection_reasons: rejections,
    is_override: false
  };
}
