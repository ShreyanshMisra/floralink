"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  StageSightingInput,
  StagedSightingReport,
} from "@/features/reports/report-contracts";

export type LocationEditMode = "idle" | "pin" | "bounding_box";

export class DraftConflictError extends Error {
  readonly code = "DRAFT_CONFLICT";

  constructor(public readonly currentStageId: string) {
    super("The staged sighting changed after the agent last read it.");
    this.name = "DraftConflictError";
  }
}

type HumanDraftPatch = Partial<
  Pick<
    StagedSightingReport,
      | "rawTaxonGuess"
      | "taxon"
      | "identificationConfidence"
    | "location"
    | "observedAt"
    | "hostStatus"
    | "notes"
      | "agentEvidenceSummary"
    | "verification"
    | "acknowledgedApproximateLocation"
    | "media"
  >
>;

export interface ReportDraftState {
  hydrated: boolean;
  draft: StagedSightingReport | null;
  reviewOpen: boolean;
  announcement: string;
  locationEditMode: LocationEditMode;
  locationEditAnchor: { latitude: number; longitude: number } | null;
  markHydrated: () => void;
  stageFromAgent: (input: StageSightingInput) => StagedSightingReport;
  stageFromHuman: () => StagedSightingReport;
  editFromHuman: (patch: HumanDraftPatch) => void;
  setLocationEditMode: (mode: LocationEditMode) => void;
  handleMapLocationClick: (latitude: number, longitude: number) => void;
  closeReview: () => void;
  clearSubmittedDraft: () => void;
  discardDraft: () => void;
}

function createStageId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

export const reportDraftStore = createStore<ReportDraftState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      draft: null,
      reviewOpen: false,
      announcement: "",
      locationEditMode: "idle",
      locationEditAnchor: null,
      markHydrated: () => set({ hydrated: true }),
      stageFromAgent: (input) => {
        const current = get().draft;
        if (
          current?.lastEditedBy === "human" &&
          (input.expected_stage_id !== current.stageId ||
            input.expected_revision !== current.revision)
        ) {
          throw new DraftConflictError(current.stageId);
        }
        if (
          input.expected_stage_id &&
          (!current ||
            input.expected_stage_id !== current.stageId ||
            input.expected_revision !== current.revision)
        ) {
          throw new DraftConflictError(current?.stageId ?? input.expected_stage_id);
        }

        const timestamp = nowIso();
        const draft: StagedSightingReport = {
          stageId: current?.stageId ?? createStageId(),
          revision: (current?.revision ?? 0) + 1,
          taxon: input.taxon ?? null,
          rawTaxonGuess: input.raw_taxon_guess,
          identificationConfidence: input.identification_confidence ?? null,
          location: input.location,
          observedAt: new Date(input.observed_at).toISOString(),
          hostStatus: input.host_status,
          notes: input.notes,
          agentEvidenceSummary: input.agent_evidence_summary ?? null,
          verification: input.verification ?? null,
          stagedBy: current?.stagedBy ?? "webmcp",
          stagedAt: current?.stagedAt ?? timestamp,
          lastEditedBy: "agent",
          acknowledgedApproximateLocation: false,
          media: current?.media ?? null,
        };
        set({
          draft,
          reviewOpen: true,
          announcement: "Sighting staged for review",
          locationEditMode: "idle",
          locationEditAnchor: null,
        });
        return draft;
      },
      stageFromHuman: () => {
        const timestamp = nowIso();
        const draft: StagedSightingReport = {
          stageId: createStageId(),
          revision: 1,
          taxon: null,
          rawTaxonGuess: "Unidentified sighting",
          identificationConfidence: null,
          location: {
            mode: "unresolved",
            roughDescription: "Location not yet provided",
            reason: "insufficient_detail",
          },
          observedAt: timestamp,
          hostStatus: "unknown",
          notes: "",
          agentEvidenceSummary: null,
          verification: null,
          stagedBy: "human",
          stagedAt: timestamp,
          lastEditedBy: "human",
          acknowledgedApproximateLocation: false,
          media: null,
        };
        set({ draft, reviewOpen: true, announcement: "Manual draft opened" });
        return draft;
      },
      editFromHuman: (patch) =>
        set((state) => ({
          draft: state.draft
            ? {
                ...state.draft,
                ...patch,
                revision: state.draft.revision + 1,
                lastEditedBy: "human",
              }
            : null,
          announcement: state.draft ? "Draft updated" : state.announcement,
        })),
      setLocationEditMode: (mode) =>
        set({ locationEditMode: mode, locationEditAnchor: null }),
      handleMapLocationClick: (latitude, longitude) => {
        const state = get();
        if (!state.draft || state.locationEditMode === "idle") return;
        if (state.locationEditMode === "pin") {
          state.editFromHuman({
            location: {
              mode: "point",
              latitude,
              longitude,
              accuracyMeters: null,
              source: "manual_pin",
            },
          });
          set({ locationEditMode: "idle", locationEditAnchor: null });
          return;
        }
        if (!state.locationEditAnchor) {
          set({ locationEditAnchor: { latitude, longitude } });
          return;
        }
        const south = Math.min(state.locationEditAnchor.latitude, latitude);
        const north = Math.max(state.locationEditAnchor.latitude, latitude);
        const west = Math.min(state.locationEditAnchor.longitude, longitude);
        const east = Math.max(state.locationEditAnchor.longitude, longitude);
        if (south === north || west === east) return;
        state.editFromHuman({
          location: {
            mode: "bounding_box",
            south,
            west,
            north,
            east,
            source: "manual_bbox",
          },
        });
        set({ locationEditMode: "idle", locationEditAnchor: null });
      },
      closeReview: () => set({ reviewOpen: false, locationEditMode: "idle" }),
      clearSubmittedDraft: () =>
        set({
          draft: null,
          reviewOpen: false,
          announcement: "Sighting submitted",
          locationEditMode: "idle",
          locationEditAnchor: null,
        }),
      discardDraft: () =>
        set({
          draft: null,
          reviewOpen: false,
          announcement: "Draft discarded",
          locationEditMode: "idle",
          locationEditAnchor: null,
        }),
    }),
    {
      name: "floralink-staged-report",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ draft: state.draft, reviewOpen: state.reviewOpen }),
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);

export function useReportDraftStore<T>(
  selector: (state: ReportDraftState) => T,
) {
  return useStore(reportDraftStore, selector);
}

export const selectDraft = (state: ReportDraftState) => state.draft;
export const selectHydrated = (state: ReportDraftState) => state.hydrated;
export const selectReviewOpen = (state: ReportDraftState) => state.reviewOpen;
