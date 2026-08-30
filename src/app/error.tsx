"use client";

import { useEffect } from "react";
import Link from "next/link";

import { logClientErrorBoundary } from "@/lib/safe-client-log";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logClientErrorBoundary(error);
  }, [error]);

  return (
    <main className="error-page">
      <p className="eyebrow">FloraLink</p>
      <h1>This page could not be displayed</h1>
      <p>Try again. Your staged report remains in this browser session.</p>
      <div className="page-actions">
        <button type="button" className="confirm-button" onClick={reset}>
          Try again
        </button>
        <Link href="/">Return home</Link>
      </div>
    </main>
  );
}
