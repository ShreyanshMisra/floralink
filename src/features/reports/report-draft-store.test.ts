// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  DraftConflictError,
  reportDraftStore,
} from "@/features/reports/report-draft-store";

const baseInput = {
  raw_taxon_guess: "Emerald ash borer",
  location: {
    mode: "point" as const,
    latitude: 42.36,
    longitude: -71.06,
    accuracyMeters: null,
    source: "agent_supplied" as const,
  },
  observed_at: "2026-08-31T12:00:00Z",
  host_status: "damaged" as const,
  notes: "Bark damage",
};

beforeEach(() => {
  sessionStorage.clear();
  reportDraftStore.setState({
    hydrated: true,
    draft: null,
    reviewOpen: false,
    announcement: "",
    locationEditMode: "idle",
    locationEditAnchor: null,
  });
});

describe("reportDraftStore", () => {
  it("increments revisions and marks human edits", () => {
    const staged = reportDraftStore.getState().stageFromAgent(baseInput);
    expect(staged.revision).toBe(1);
    expect(reportDraftStore.getState().announcement).toBe(
      "Sighting staged for review",
    );

    reportDraftStore.getState().editFromHuman({ notes: "Edited note" });
    expect(reportDraftStore.getState().draft).toMatchObject({
      revision: 2,
      lastEditedBy: "human",
      notes: "Edited note",
    });
  });

  it("rejects a stale agent update after a human edit", () => {
    const staged = reportDraftStore.getState().stageFromAgent(baseInput);
    reportDraftStore.getState().editFromHuman({ hostStatus: "dead" });

    expect(() =>
      reportDraftStore.getState().stageFromAgent({
        ...baseInput,
        expected_stage_id: staged.stageId,
        expected_revision: 1,
      }),
    ).toThrow(DraftConflictError);
    expect(reportDraftStore.getState().draft?.hostStatus).toBe("dead");
  });

  it("accepts an agent update at the current human-edited revision", () => {
    const staged = reportDraftStore.getState().stageFromAgent(baseInput);
    reportDraftStore.getState().editFromHuman({ notes: "Human evidence" });
    const updated = reportDraftStore.getState().stageFromAgent({
      ...baseInput,
      notes: "Agent incorporated edit",
      expected_stage_id: staged.stageId,
      expected_revision: 2,
    });

    expect(updated).toMatchObject({
      stageId: staged.stageId,
      revision: 3,
      lastEditedBy: "agent",
    });
  });
});
