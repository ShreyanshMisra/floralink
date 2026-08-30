import { describe, expect, it } from "vitest";

import { canConfirmSighting } from "@/features/reports/confirmation";
import type { StagedSightingReport } from "@/features/reports/report-contracts";

const draft: StagedSightingReport = {
  stageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  revision: 1,
  taxon: null,
  rawTaxonGuess: "Emerald ash borer",
  identificationConfidence: null,
  location: { mode: "point", latitude: 42.36, longitude: -71.06, accuracyMeters: null, source: "manual_pin" },
  observedAt: "2025-08-29T12:00:00.000Z",
  hostStatus: "unknown",
  notes: "",
  agentEvidenceSummary: null,
  verification: null,
  stagedBy: "human",
  stagedAt: "2025-08-29T12:00:00.000Z",
  lastEditedBy: "human",
  acknowledgedApproximateLocation: false,
  media: null,
};

describe("confirmation enablement", () => {
  it("requires initialized auth and the final human acknowledgement", () => {
    expect(canConfirmSighting({ authReady: false, draft, humanAcknowledged: true, isSubmitting: false })).toBe(false);
    expect(canConfirmSighting({ authReady: true, draft, humanAcknowledged: false, isSubmitting: false })).toBe(false);
    expect(canConfirmSighting({ authReady: true, draft, humanAcknowledged: true, isSubmitting: false })).toBe(true);
  });

  it("blocks unresolved and unacknowledged approximate locations but permits unverified reports", () => {
    expect(canConfirmSighting({
      authReady: true,
      humanAcknowledged: true,
      isSubmitting: false,
      draft: { ...draft, verification: null },
    })).toBe(true);
    expect(canConfirmSighting({
      authReady: true,
      humanAcknowledged: true,
      isSubmitting: false,
      draft: { ...draft, location: { mode: "unresolved", roughDescription: "near trail", reason: "missing_reference" } },
    })).toBe(false);
    expect(canConfirmSighting({
      authReady: true,
      humanAcknowledged: true,
      isSubmitting: false,
      draft: { ...draft, location: { mode: "bounding_box", south: 42, west: -72, north: 43, east: -71, source: "manual_bbox" } },
    })).toBe(false);
  });
});
