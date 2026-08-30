// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EvidencePhotoPicker } from "@/components/reports/evidence-photo-picker";
import type { StagedSightingReport } from "@/features/reports/report-contracts";

const draft: StagedSightingReport = {
  stageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  revision: 1,
  taxon: null,
  rawTaxonGuess: "Emerald Ash Borer",
  identificationConfidence: null,
  location: {
    mode: "point",
    latitude: 42.36,
    longitude: -71.06,
    accuracyMeters: null,
    source: "manual_pin",
  },
  observedAt: "2026-08-30T12:00:00.000Z",
  hostStatus: "unknown",
  notes: "",
  agentEvidenceSummary: null,
  verification: null,
  stagedBy: "human",
  stagedAt: "2026-08-30T12:00:00.000Z",
  lastEditedBy: "human",
  acknowledgedApproximateLocation: false,
  media: {
    storagePath:
      "user/stage/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp",
    mimeType: "image/webp",
    sizeBytes: 104 * 1024,
    width: 1100,
    height: 520,
  },
};

describe("EvidencePhotoPicker", () => {
  it("renders processed photo details as compact badges", () => {
    render(
      <EvidencePhotoPicker
        draft={draft}
        onMediaChange={vi.fn()}
        onUsePhotoLocation={vi.fn()}
      />,
    );

    const details = screen.getByLabelText("Processed photo details");
    expect(details.textContent).toContain("1100×520");
    expect(details.textContent).toContain("104 KB");
    expect(details.textContent).toContain("Metadata Stripped");
    expect(details.textContent).not.toContain("Ready:");
  });
});
