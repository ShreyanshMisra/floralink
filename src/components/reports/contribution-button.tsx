"use client";

import { useState } from "react";

import { ensureAnonymousAuth } from "@/features/auth/ensure-anonymous-auth";
import {
  reportDraftStore,
  useReportDraftStore,
} from "@/features/reports/report-draft-store";

export function ContributionButton() {
  const draft = useReportDraftStore((state) => state.draft);
  const reviewOpen = useReportDraftStore((state) => state.reviewOpen);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function beginContribution() {
    const state = reportDraftStore.getState();
    if (state.draft) {
      state.openReview();
      setStatus("idle");
      return;
    }

    setStatus("loading");
    try {
      await ensureAnonymousAuth();
      reportDraftStore.getState().stageFromHuman();
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  const label = draft
    ? reviewOpen
      ? "Draft Open"
      : "Open Draft"
    : "Report Manually";

  return (
    <div className="contribution-control">
      <button
        type="button"
        className="contribution-button"
        onClick={beginContribution}
        disabled={status === "loading"}
        aria-busy={status === "loading"}
      >
        {status === "loading" ? "Starting…" : label}
      </button>
      <span className="sr-only" aria-live="polite">
        {status === "error"
          ? "Could not start a contribution session."
          : ""}
      </span>
      {status === "error" ? (
        <p className="contribution-error" role="alert">
          Could not start a contribution session. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}
