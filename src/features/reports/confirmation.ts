import { getDraftValidationSummary, type StagedSightingReport } from "@/features/reports/report-contracts";

export function canConfirmSighting({
  authReady,
  draft,
  humanAcknowledged,
  isSubmitting,
}: {
  authReady: boolean;
  draft: StagedSightingReport | null;
  humanAcknowledged: boolean;
  isSubmitting: boolean;
}) {
  if (!authReady || !draft || !humanAcknowledged || isSubmitting) return false;
  if (getDraftValidationSummary(draft).length > 0) return false;
  if (draft.location.mode === "bounding_box" && !draft.acknowledgedApproximateLocation) return false;
  return true;
}
