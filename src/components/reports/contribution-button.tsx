"use client";

import { useState } from "react";

import { ensureAnonymousAuth } from "@/features/auth/ensure-anonymous-auth";

export function ContributionButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );

  async function beginContribution() {
    setStatus("loading");
    try {
      await ensureAnonymousAuth();
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
            ? "Contribution ready"
            : "Report manually"}
      </button>
      <span className="sr-only" aria-live="polite">
        {status === "ready"
          ? "Anonymous contribution session ready."
          : status === "error"
            ? "Could not start a contribution session."
            : ""}
      </span>
    </div>
  );
}
