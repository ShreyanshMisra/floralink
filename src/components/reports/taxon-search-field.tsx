"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { SightingLocation } from "@/features/reports/report-contracts";
import type { TaxonCandidate } from "@/features/taxonomy/contracts";

export const TAXON_SEARCH_DEBOUNCE_MS = 400;

type SearchEnvelope =
  | { ok: true; data: TaxonCandidate[] }
  | { ok: false; error: { code?: string; message: string } };

export function TaxonSearchField({
  value,
  location,
  onChange,
  onSelect,
}: {
  value: string;
  location: SightingLocation;
  onChange: (value: string) => void;
  onSelect: (candidate: TaxonCandidate) => void;
}) {
  const descriptionId = useId();
  const listId = useId();
  const selectedQueryRef = useRef<string | null>(null);
  const [results, setResults] = useState<TaxonCandidate[]>([]);
  const [status, setStatus] = useState<"idle" | "waiting" | "loading" | "empty" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2 || selectedQueryRef.current === query) {
      setResults([]);
      setStatus("idle");
      setError(null);
      return;
    }

    const controller = new AbortController();
    setStatus("waiting");
    setError(null);
    const timer = setTimeout(async () => {
      setStatus("loading");
      const params = new URLSearchParams({ q: query, limit: "5" });
      if (location.mode === "point") {
        params.set("lat", String(location.latitude));
        params.set("lng", String(location.longitude));
      }
      try {
        const response = await fetch(`/api/taxa/search?${params}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as SearchEnvelope;
        if (!response.ok || !body.ok) {
          if (!body.ok && body.error.code === "TAXON_NOT_FOUND") {
            setResults([]);
            setStatus("empty");
            return;
          }
          throw new Error(body.ok ? "Taxon search failed." : body.error.message);
        }
        setResults(body.data);
        setStatus("idle");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setResults([]);
        setStatus("error");
        setError("Taxon suggestions are unavailable. Keep the typed guess or try again.");
      }
    }, TAXON_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [location, value]);

  return (
    <div className="taxon-search">
      <label htmlFor={`${descriptionId}-input`}>Species guess</label>
      <p id={descriptionId} className="field-note">
        Search species by common or scientific name (e.g., Emerald Ash Borer).
      </p>
      <input
        id={`${descriptionId}-input`}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={results.length > 0}
        aria-describedby={descriptionId}
        aria-invalid={error ? "true" : undefined}
        onChange={(event) => {
          selectedQueryRef.current = null;
          onChange(event.target.value);
        }}
      />
      {status === "waiting" || status === "loading" ? (
        <p className="field-note" role="status">Searching taxonomy…</p>
      ) : null}
      {status === "empty" ? (
        <p className="field-note" role="status">No taxonomy suggestions matched. Keep the typed guess or refine it.</p>
      ) : null}
      {error ? <p className="warning-note" role="alert">{error}</p> : null}
      <ul id={listId} className="taxon-results" role="listbox" aria-label="Taxonomy suggestions">
        {results.map((candidate) => (
          <li key={candidate.inaturalistTaxonId}>
            <button
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => {
                const selectedName = candidate.commonName ?? candidate.scientificName;
                selectedQueryRef.current = selectedName;
                setResults([]);
                setStatus("idle");
                onSelect(candidate);
              }}
            >
              <strong>{candidate.commonName ?? candidate.scientificName}</strong>
              <span>
                {candidate.commonName ? `${candidate.scientificName} · ` : ""}
                {candidate.rank ?? "unranked"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
