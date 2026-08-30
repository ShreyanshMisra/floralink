"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EvidencePhotoPicker } from "@/components/reports/evidence-photo-picker";
import { TaxonSearchField } from "@/components/reports/taxon-search-field";
import { useFocusTrap } from "@/features/accessibility/use-focus-trap";
import { ensureAnonymousAuth } from "@/features/auth/ensure-anonymous-auth";
import {
  DevicePositionError,
  getDevicePosition,
} from "@/features/geolocation/get-device-position";
import { deleteStagedMedia } from "@/features/media/storage";
import { canConfirmSighting } from "@/features/reports/confirmation";
import { getDraftValidationSummary } from "@/features/reports/report-contracts";
import { useReportDraftStore } from "@/features/reports/report-draft-store";
import {
  submissionReceiptSchema,
  type SubmissionReceipt,
} from "@/features/reports/submission-contracts";

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

export function DraftAnnouncement() {
  const announcement = useReportDraftStore((state) => state.announcement);
  return (
    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </span>
  );
}

export function StagedReportCard({
  onSubmitted,
}: {
  onSubmitted?: (receipt: SubmissionReceipt) => void;
}) {
  const draft = useReportDraftStore((state) => state.draft);
  const reviewOpen = useReportDraftStore((state) => state.reviewOpen);
  const locationEditMode = useReportDraftStore(
    (state) => state.locationEditMode,
  );
  const locationEditAnchor = useReportDraftStore(
    (state) => state.locationEditAnchor,
  );
  const editFromHuman = useReportDraftStore((state) => state.editFromHuman);
  const setLocationEditMode = useReportDraftStore(
    (state) => state.setLocationEditMode,
  );
  const closeReview = useReportDraftStore((state) => state.closeReview);
  const clearSubmittedDraft = useReportDraftStore(
    (state) => state.clearSubmittedDraft,
  );
  const discardDraft = useReportDraftStore((state) => state.discardDraft);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [acknowledgedStageId, setAcknowledgedStageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [submissionError, setSubmissionError] = useState<{
    stageId: string;
    message: string;
  } | null>(null);
  const stageId = draft?.stageId;
  const dialogRef = useRef<HTMLElement>(null);
  const handleClose = useCallback(() => closeReview(), [closeReview]);
  useFocusTrap(dialogRef, handleClose, Boolean(draft && reviewOpen));

  useEffect(() => {
    if (!stageId || !reviewOpen) return;
    let active = true;
    ensureAnonymousAuth()
      .then(() => {
        if (active) setAuthReady(true);
      })
      .catch(() => {
        if (active) setAuthError("A contribution session could not be initialized.");
      });
    return () => { active = false; };
  }, [stageId, reviewOpen]);

  if (!draft || !reviewOpen) return null;
  const activeDraft = draft;

  const validationIssues = getDraftValidationSummary(draft);
  const statusSource = draft.verification?.sources.find(
    (source) => source.kind === "regional_status",
  );

  async function useCurrentLocation() {
    setLocating(true);
    setLocationError(null);
    try {
      const position = await getDevicePosition();
      editFromHuman({
        location: {
          mode: "point",
          latitude: position.latitude,
          longitude: position.longitude,
          accuracyMeters: position.accuracyMeters,
          source: "device",
        },
      });
    } catch (error) {
      setLocationError(
        error instanceof DevicePositionError
          ? error.message
          : "Device location is unavailable.",
      );
    } finally {
      setLocating(false);
    }
  }

  async function discardWithCleanup() {
    if (isDiscarding || isSubmitting) return;
    setIsDiscarding(true);
    setSubmissionError(null);
    try {
      await deleteStagedMedia(activeDraft.media);
      discardDraft();
    } catch (error) {
      setSubmissionError({
        stageId: activeDraft.stageId,
        message: error instanceof Error ? error.message : "The staged photo could not be removed.",
      });
    } finally {
      setIsDiscarding(false);
    }
  }

  async function submitReport() {
    if (isSubmitting || isDiscarding) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await ensureAnonymousAuth();
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `${activeDraft.stageId}:${activeDraft.revision}`,
        },
        body: JSON.stringify({
          stageId: activeDraft.stageId,
          revision: activeDraft.revision,
          rawTaxonGuess: activeDraft.rawTaxonGuess,
          taxon: activeDraft.taxon,
          identificationConfidence: activeDraft.identificationConfidence,
          location: activeDraft.location,
          observedAt: activeDraft.observedAt,
          hostStatus: activeDraft.hostStatus,
          notes: activeDraft.notes,
          agentEvidenceSummary: activeDraft.agentEvidenceSummary,
          verificationId: activeDraft.verification?.verificationId ?? null,
          acknowledgedApproximateLocation: activeDraft.acknowledgedApproximateLocation,
          humanAcknowledged: true,
          media: activeDraft.media,
        }),
      });
      const body = await response.json() as { ok: boolean; data?: unknown; error?: { message?: string } };
      if (!response.ok || !body.ok) {
        throw new Error(body.error?.message ?? "The sighting could not be submitted.");
      }
      const receipt = submissionReceiptSchema.parse(body.data);
      clearSubmittedDraft();
      onSubmitted?.(receipt);
    } catch (error) {
      setSubmissionError({
        stageId: activeDraft.stageId,
        message: error instanceof Error ? error.message : "The sighting could not be submitted.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const confirmEnabled = canConfirmSighting({
    authReady,
    draft,
    humanAcknowledged: acknowledgedStageId === draft.stageId,
    isSubmitting,
  });

  return (
    <section
      ref={dialogRef}
      className="staged-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="staged-card-heading"
      tabIndex={-1}
    >
      <div className="staged-card-header">
        <div>
          <p className="eyebrow">
            {draft.stagedBy === "webmcp"
              ? "Agent-prepared draft"
              : "Human-started draft"}
          </p>
          <h2 id="staged-card-heading">Review sighting</h2>
        </div>
        <button type="button" className="text-button" onClick={closeReview}>
          Close
        </button>
      </div>

      <div className="draft-status-row">
        <span className="not-submitted-badge">Not submitted</span>
        <span>
          Revision {draft.revision} · {draft.lastEditedBy === "human" ? "Edited by you" : "Prepared by agent"}
        </span>
      </div>

      <fieldset>
        <legend>Species identity</legend>
        <TaxonSearchField
          value={draft.rawTaxonGuess}
          location={draft.location}
          onChange={(rawTaxonGuess) =>
            editFromHuman({ rawTaxonGuess, taxon: null, verification: null })
          }
          onSelect={(taxon) =>
            editFromHuman({
              rawTaxonGuess: taxon.commonName ?? taxon.scientificName,
              taxon,
              verification: null,
            })
          }
        />
        {draft.taxon ? (
          <div className="identity-summary">
            <strong>{draft.taxon.commonName ?? draft.taxon.scientificName}</strong>
            <span className="scientific-name">{draft.taxon.scientificName}</span>
            <a href={draft.taxon.sourceUrl} target="_blank" rel="noreferrer">
              Taxonomy source
            </a>
            <button
              type="button"
              className="text-button"
              onClick={() => editFromHuman({ taxon: null })}
            >
              Clear selected match
            </button>
          </div>
        ) : (
          <p className="field-note">No canonical taxon selected.</p>
        )}
        <label>
          Identification confidence (0–1)
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            aria-describedby="confidence-help"
            value={draft.identificationConfidence ?? ""}
            onChange={(event) =>
              editFromHuman({
                identificationConfidence:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </label>
        <p id="confidence-help" className="field-note">
          Optional confidence supplied by the observer or agent; it is separate from taxonomy matching.
        </p>
      </fieldset>

      <section className="review-section" aria-labelledby="regional-status-heading">
        <h3 id="regional-status-heading">Regional status</h3>
        {draft.verification ? (
          <>
            <div className="status-badges">
              <span>{humanize(draft.verification.ecologicalStatus)}</span>
              <span>{humanize(draft.verification.urgency)} urgency</span>
              <span>{humanize(draft.verification.state)}</span>
            </div>
            {statusSource ? (
              <a href={statusSource.url} target="_blank" rel="noreferrer">
                {statusSource.name}
              </a>
            ) : (
              <p className="field-note">No regional authority source is attached.</p>
            )}
            {draft.verification.warnings.map((warning) => (
              <p className="warning-note" key={warning}>{warning}</p>
            ))}
            <button
              type="button"
              className="text-button"
              onClick={() => editFromHuman({ verification: null })}
            >
              Remove verification
            </button>
          </>
        ) : (
          <p className="warning-note">Regional status has not been verified.</p>
        )}
      </section>

      <fieldset>
        <legend>Observation details</legend>
        <label>
          Observation time
          <input
            type="datetime-local"
            aria-describedby="observation-time-help"
            value={toLocalDateTime(draft.observedAt)}
            onChange={(event) => {
              if (event.target.value) {
                editFromHuman({ observedAt: new Date(event.target.value).toISOString() });
              }
            }}
          />
        </label>
        <p id="observation-time-help" className="field-note">Use the local date and time when the sighting occurred.</p>
        <label>
          Host condition
          <select
            aria-describedby="host-condition-help"
            value={draft.hostStatus}
            onChange={(event) =>
              editFromHuman({
                hostStatus: event.target.value as typeof draft.hostStatus,
              })
            }
          >
            <option value="healthy">Healthy</option>
            <option value="damaged">Damaged</option>
            <option value="dead">Dead</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <p id="host-condition-help" className="field-note">Describe the observed host, or choose unknown.</p>
        <label>
          Notes
          <textarea
            maxLength={2000}
            aria-describedby="notes-help"
            value={draft.notes}
            onChange={(event) => editFromHuman({ notes: event.target.value })}
          />
        </label>
        <p id="notes-help" className="field-note">Optional field notes; do not include sensitive personal information.</p>
        <label>
          Evidence summary
          <textarea
            maxLength={2000}
            aria-describedby="evidence-summary-help"
            value={draft.agentEvidenceSummary ?? ""}
            onChange={(event) =>
              editFromHuman({ agentEvidenceSummary: event.target.value || null })
            }
          />
        </label>
        <p id="evidence-summary-help" className="field-note">Optional visible-trait summary; this is not a photo upload.</p>
      </fieldset>

      <section className="review-section" aria-labelledby="location-heading">
        <h3 id="location-heading">Location</h3>
        <p id="location-summary" className="location-summary">
          {draft.location.mode === "point"
            ? `${draft.location.latitude.toFixed(5)}, ${draft.location.longitude.toFixed(5)} · ${humanize(draft.location.source)}${draft.location.accuracyMeters === null ? " · accuracy unknown" : ` · ±${Math.round(draft.location.accuracyMeters)} m`}`
            : draft.location.mode === "bounding_box"
              ? `Approximate area: ${draft.location.south.toFixed(4)}, ${draft.location.west.toFixed(4)} to ${draft.location.north.toFixed(4)}, ${draft.location.east.toFixed(4)}`
              : `${draft.location.roughDescription} · ${humanize(draft.location.reason)}`}
        </p>
        {draft.location.mode === "bounding_box" ? (
          <label className="checkbox-label">
            <input
              type="checkbox"
              aria-describedby="location-summary"
              checked={draft.acknowledgedApproximateLocation}
              onChange={(event) =>
                editFromHuman({
                  acknowledgedApproximateLocation: event.target.checked,
                })
              }
            />
            I understand this location represents an approximate area.
          </label>
        ) : null}
        <div className="location-actions">
          <button type="button" onClick={useCurrentLocation} disabled={locating}>
            {locating ? "Locating…" : "Use current location"}
          </button>
          <button type="button" onClick={() => setLocationEditMode("pin")}>
            Drop a pin
          </button>
          <button
            type="button"
            onClick={() => setLocationEditMode("bounding_box")}
          >
            Draw approximate area
          </button>
        </div>
        {locationEditMode !== "idle" ? (
          <p className="map-instruction" role="status">
            {locationEditMode === "pin"
              ? "Select the sighting location on the map."
              : locationEditAnchor
                ? "Select the opposite corner of the approximate area."
                : "Select the first corner of the approximate area."}
          </p>
        ) : null}
        {locationError ? <p id="location-error" className="warning-note" role="alert">{locationError} Choose a manual map option or try again.</p> : null}
      </section>

      <EvidencePhotoPicker
        draft={draft}
        onMediaChange={(media) => editFromHuman({ media })}
        onUsePhotoLocation={(location) =>
          editFromHuman({
            location: {
              mode: "point",
              latitude: location.latitude,
              longitude: location.longitude,
              accuracyMeters: null,
              source: "photo_exif",
            },
          })
        }
      />

      <section className="validation-summary" aria-labelledby="validation-heading">
        <h3 id="validation-heading">Validation summary</h3>
        {validationIssues.length === 0 ? (
          <p>Required staged fields are ready for human review.</p>
        ) : (
          <ul>
            {validationIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        )}
      </section>

      <div className="draft-actions">
        <label className="checkbox-label final-acknowledgement">
          <input
            type="checkbox"
            aria-describedby="confirmation-help"
            checked={acknowledgedStageId === draft.stageId}
            onChange={(event) =>
              setAcknowledgedStageId(event.target.checked ? draft.stageId : null)
            }
          />
          I reviewed this information and want to submit this sighting.
        </label>
        <p id="confirmation-help" className="field-note">Submission is durable and can only happen after this human acknowledgement.</p>
        {!authReady && !authError ? <p className="field-note" role="status">Preparing a secure contribution session…</p> : null}
        {authError ? <p id="auth-error" className="warning-note" role="alert">{authError} Close the review and try “Report manually” again.</p> : null}
        {submissionError?.stageId === draft.stageId ? (
          <p id="submission-error" className="warning-note" role="alert">{submissionError.message} Review the fields and try again.</p>
        ) : null}
        <button
          type="button"
          className="confirm-button"
          aria-describedby="confirmation-help submission-error auth-error"
          disabled={!confirmEnabled || isDiscarding}
          onClick={() => void submitReport()}
        >
          {isSubmitting ? "Submitting…" : "Confirm sighting"}
        </button>
        <button type="button" className="discard-button" disabled={isSubmitting || isDiscarding} onClick={() => void discardWithCleanup()}>
          {isDiscarding ? "Discarding…" : "Discard draft"}
        </button>
      </div>
    </section>
  );
}
