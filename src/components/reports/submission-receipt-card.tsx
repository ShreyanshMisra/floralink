"use client";

import { useEffect, useState } from "react";

import type { SubmissionReceipt } from "@/features/reports/submission-contracts";

function locationText(receipt: SubmissionReceipt) {
  const location = receipt.publicReport.location;
  return location.mode === "point"
    ? `${location.latitude.toFixed(2)}, ${location.longitude.toFixed(2)}`
    : `${location.south.toFixed(2)}, ${location.west.toFixed(2)} to ${location.north.toFixed(2)}, ${location.east.toFixed(2)}`;
}

export function SubmissionReceiptCard({ receipt }: { receipt: SubmissionReceipt }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailStatus, setThumbnailStatus] = useState<"idle" | "loading" | "error">(
    receipt.publicReport.hasThumbnail ? "loading" : "idle",
  );
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!receipt.publicReport.hasThumbnail) return;
    const controller = new AbortController();
    fetch(`/api/reports/${receipt.reportId}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Thumbnail unavailable");
        return response.json();
      })
      .then((body: { ok?: boolean; data?: { media?: { url?: string | null } | null } }) => {
        if (!body.ok || !body.data?.media?.url) throw new Error("Thumbnail unavailable");
        setThumbnailUrl(body.data.media.url);
        setThumbnailStatus("idle");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setThumbnailStatus("error");
      });
    return () => controller.abort();
  }, [receipt, reloadToken]);

  return (
    <section className="receipt-card" aria-live="polite" aria-labelledby="receipt-heading">
      <p className="eyebrow">Submission receipt</p>
      <h2 id="receipt-heading">Sighting submitted</h2>
      <dl>
        <div><dt>Receipt ID</dt><dd>{receipt.receiptId}</dd></div>
        <div><dt>Safe public location</dt><dd>{locationText(receipt)}</dd></div>
        <div><dt>Submitted</dt><dd>{new Date(receipt.submittedAt).toLocaleString()}</dd></div>
      </dl>
      {thumbnailStatus === "loading" ? <p className="field-note" role="status">Loading the private evidence preview…</p> : null}
      {thumbnailStatus === "error" ? (
        <div className="warning-note" role="alert">
          <p>The evidence preview is temporarily unavailable. The report was still submitted.</p>
          <button type="button" onClick={() => {
            setThumbnailStatus("loading");
            setReloadToken((value) => value + 1);
          }}>Retry preview</button>
        </div>
      ) : null}
      {/* The short-lived signed URL is not suitable for Next Image optimization. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {thumbnailUrl ? <img className="receipt-thumbnail" src={thumbnailUrl} alt="Submitted sighting evidence" /> : null}
    </section>
  );
}
