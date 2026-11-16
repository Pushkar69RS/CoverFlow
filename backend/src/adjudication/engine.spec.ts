import { describe, it, expect } from 'vitest';
import { evaluateCoverage } from './engine';
import { GOLDEN_CASES } from './goldenCases';

describe('CoverFlow Deterministic Coverage Adjudication Engine', () => {
  it('should have at least 60 golden test cases as required by SRS NFR-02', () => {
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(60);
    console.log(`Verified ${GOLDEN_CASES.length} Golden Adjudication Cases loaded.`);
  });

  // Execute every golden case
  GOLDEN_CASES.forEach((tc) => {
    it(`[${tc.id}] ${tc.category}: ${tc.name}`, () => {
      // Run once
      const result = evaluateCoverage(tc.context);

      expect(result.outcome).toBe(tc.expected.outcome);
      expect(result.reason_code).toBe(tc.expected.reason_code);

      if (tc.expected.parts_covered !== undefined) {
        expect(result.parts_covered).toBe(tc.expected.parts_covered);
      }
      if (tc.expected.labour_covered !== undefined) {
        expect(result.labour_covered).toBe(tc.expected.labour_covered);
      }

      // NFR-02: Determinism check - 10 consecutive identical evaluations
      for (let i = 0; i < 10; i++) {
        const repeat = evaluateCoverage(tc.context);
        expect(repeat.outcome).toBe(result.outcome);
        expect(repeat.reason_code).toBe(result.reason_code);
        expect(repeat.chosen_entitlement_id).toBe(result.chosen_entitlement_id);
      }
    });
  });
});
