"use client";

import { useState } from "react";

import { ensureAnonymousAuth } from "@/features/auth/ensure-anonymous-auth";
import { reportDraftStore } from "@/features/reports/report-draft-store";

export function ContributionButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );

  async function beginContribution() {
    setStatus("loading");
    try {
      await ensureAnonymousAuth();
      if (!reportDraftStore.getState().draft) {
        reportDraftStore.getState().stageFromHuman();
      }
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="contribution-control">
      <button
        type="button"
        className="contribution-button"
        onClick={beginContribution}
        disabled={status === "loading" || status === "ready"}
      >
        {status === "loading"
          ? "Starting…"
          : status === "ready"
            ? "Draft open"
            : "Report manually"}
      </button>
      <span className="sr-only" aria-live="polite">
        {status === "ready"
          ? "Anonymous contribution session ready."
          : status === "error"
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
