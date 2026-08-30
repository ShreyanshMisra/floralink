"use client";

import { useEffect } from "react";
import Link from "next/link";

import { logClientErrorBoundary } from "@/lib/safe-client-log";

export default function GlobalError({
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
    <html lang="en">
      <body>
        <main className="error-page">
          <p className="eyebrow">FloraLink</p>
          <h1>Something interrupted this view</h1>
          <p>
            Your staged report remains in this browser session. Try loading the
            view again; if the problem continues, return to the home page.
          </p>
          <div className="page-actions">
            <button type="button" className="confirm-button" onClick={reset}>
              Try again
            </button>
            <Link href="/">Return home</Link>
          </div>
        </main>
      </body>
    </html>
  );
}
