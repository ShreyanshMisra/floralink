"use client";

import { useEffect, useState } from "react";

import { extractExifLocation, type ExifLocation } from "@/features/media/extract-exif-location";
import { processImage } from "@/features/media/process-image";
import { deleteStagedMedia, uploadStagedMedia } from "@/features/media/storage";
import type { StagedSightingReport } from "@/features/reports/report-contracts";

export function EvidencePhotoPicker({
  draft,
  onMediaChange,
  onUsePhotoLocation,
}: {
  draft: StagedSightingReport;
  onMediaChange: (media: StagedSightingReport["media"]) => void;
  onUsePhotoLocation: (location: ExifLocation) => void;
}) {
  const [gps, setGps] = useState<ExifLocation | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function selectPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const photoGps = await extractExifLocation(file);
      const processed = await processImage(file);
      const uploaded = await uploadStagedMedia(draft.stageId, processed);
      try {
        await deleteStagedMedia(draft.media);
      } catch (cleanupError) {
        await deleteStagedMedia(uploaded).catch(() => undefined);
        throw cleanupError;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(processed.blob));
      setGps(photoGps);
      onMediaChange(uploaded);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The photo could not be processed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="review-section" aria-labelledby="photo-heading">
      <h3 id="photo-heading">Evidence photo</h3>
      <p id="photo-privacy-help" className="field-note">
        The original never leaves this browser. FloraLink strips metadata by canvas re-encoding and uploads only the processed image.
      </p>
      <label>
        Choose JPEG, PNG, or WebP (maximum 15 MB)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-describedby="photo-privacy-help photo-error"
          aria-invalid={error ? "true" : undefined}
          disabled={busy}
          onChange={(event) => void selectPhoto(event.target.files?.[0])}
        />
      </label>
      {busy ? <p className="field-note" role="status">Processing and uploading…</p> : null}
      {error ? <p id="photo-error" className="warning-note" role="alert">{error} Choose a JPEG, PNG, or WebP under 15 MB and try again.</p> : null}
      {/* The source is an ephemeral local object URL, so Next Image cannot optimize it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {previewUrl ? <img className="processed-preview" src={previewUrl} alt="Processed evidence preview" /> : null}
      {draft.media ? (
        <p className="field-note">
          Ready: {draft.media.width}×{draft.media.height}, {(draft.media.sizeBytes / 1024).toFixed(0)} KB, metadata stripped.
        </p>
      ) : null}
      <p className="field-note">{gps ? "Photo GPS was found." : "No usable photo GPS found."}</p>
      {gps && draft.location.mode === "unresolved" ? (
        <button type="button" aria-describedby="photo-privacy-help" onClick={() => onUsePhotoLocation(gps)}>
          Use photo location ({gps.latitude.toFixed(4)}, {gps.longitude.toFixed(4)})
        </button>
      ) : null}
    </section>
  );
}
