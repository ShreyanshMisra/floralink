"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

import type { PublicReport } from "@/features/reports/public-reports";
import { StagedLocationLayer } from "@/components/map/staged-location-layer";
import { StagedReportCard } from "@/components/reports/staged-report-card";
import { SubmissionReceiptCard } from "@/components/reports/submission-receipt-card";
import type { SubmissionReceipt } from "@/features/reports/submission-contracts";

delete (L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

const defaultLatitude = Number(
  process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT ?? "42.3601",
);
const defaultLongitude = Number(
  process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG ?? "-71.0589",
);
const defaultZoom = Number(process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM ?? "8");
const tileUrl =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const tileAttribution =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? "&copy; OpenStreetMap contributors";

type ReportsEnvelope =
  | { ok: true; data: PublicReport[]; requestId: string }
  | { ok: false; error: { message: string }; requestId: string };

function ViewportLoader({
  onReports,
  onLoading,
  onError,
  reloadToken,
}: {
  onReports: (reports: PublicReport[]) => void;
  onLoading: (loading: boolean) => void;
  onError: (message: string | null) => void;
  reloadToken: number;
}) {
  const map = useMap();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const scheduleLoad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    requestRef.current?.abort();

    timerRef.current = setTimeout(async () => {
      const bounds = map.getBounds();
      const controller = new AbortController();
      requestRef.current = controller;
      onLoading(true);
      onError(null);

      const params = new URLSearchParams({
        south: String(bounds.getSouth()),
        west: String(bounds.getWest()),
        north: String(bounds.getNorth()),
        east: String(bounds.getEast()),
      });

      try {
        const response = await fetch(`/api/reports?${params}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as ReportsEnvelope;
        if (!response.ok || !body.ok) {
          throw new Error(
            body.ok ? "Public reports are unavailable." : body.error.message,
          );
        }
        onReports(body.data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        onError("The public sighting feed could not be refreshed.");
      } finally {
        if (!controller.signal.aborted) onLoading(false);
      }
    }, 400);
  }, [map, onError, onLoading, onReports]);

  useMapEvents({ moveend: scheduleLoad });

  useEffect(() => {
    scheduleLoad();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      requestRef.current?.abort();
    };
  }, [reloadToken, scheduleLoad]);

  return null;
}

function SelectedReportController({
  report,
}: {
  report: PublicReport | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!report) return;
    if (report.location.mode === "point") {
      map.setView(
        [report.location.latitude, report.location.longitude],
        Math.max(map.getZoom(), 13),
        { animate: false },
      );
      return;
    }
    map.fitBounds(
      [
        [report.location.south, report.location.west],
        [report.location.north, report.location.east],
      ],
      { padding: [32, 32], animate: false },
    );
  }, [map, report]);

  return null;
}

export default function FloraMap() {
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SubmissionReceipt | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedReport, setSelectedReport] = useState<PublicReport | null>(null);
  const [feedExpanded, setFeedExpanded] = useState(false);

  const handleSubmitted = useCallback((nextReceipt: SubmissionReceipt) => {
    setReceipt(nextReceipt);
    setReports((current) => [
      nextReceipt.publicReport,
      ...current.filter((report) => report.id !== nextReceipt.reportId),
    ]);
  }, []);

  return (
    <div className="map-and-feed">
      <section className="map-panel" aria-label="Public sighting map">
        <MapContainer
          center={[defaultLatitude, defaultLongitude]}
          zoom={defaultZoom}
          className="leaflet-map"
          scrollWheelZoom
        >
          <TileLayer url={tileUrl} attribution={tileAttribution} />
          <ViewportLoader
            onReports={setReports}
            onLoading={setIsLoading}
            onError={setError}
            reloadToken={reloadToken}
          />
          <SelectedReportController report={selectedReport} />
          <StagedLocationLayer />
          {reports.map((report) =>
            report.location.mode === "point" ? (
              <Marker
                key={report.id}
                position={[report.location.latitude, report.location.longitude]}
              >
                <Popup>
                  <strong>{report.displayTaxonName}</strong>
                  <br />
                  {report.locationPrecisionLabel}
                </Popup>
              </Marker>
            ) : (
              <Rectangle
                key={report.id}
                bounds={[
                  [report.location.south, report.location.west],
                  [report.location.north, report.location.east],
                ]}
                pathOptions={{ color: "#2f6f4e", weight: 2, fillOpacity: 0.18 }}
              />
            ),
          )}
        </MapContainer>
      </section>

      <aside className="feed-panel" aria-labelledby="feed-heading" aria-busy={isLoading}>
        <div className="sheet-handle" aria-hidden="true" />
        <StagedReportCard onSubmitted={handleSubmitted} />
        {receipt ? <SubmissionReceiptCard key={receipt.reportId} receipt={receipt} /> : null}
        <div className="feed-heading-row">
          <div>
            <p className="eyebrow">Visible area</p>
            <h2 id="feed-heading">Public sightings</h2>
          </div>
          <span className="result-count" aria-live="polite">
            {isLoading ? "Loading…" : `${reports.length} shown`}
          </span>
        </div>
        <button
          type="button"
          className="feed-toggle"
          aria-expanded={feedExpanded}
          aria-controls="public-feed-content"
          onClick={() => setFeedExpanded((current) => !current)}
        >
          {feedExpanded ? "Collapse sighting list" : "Explore sighting list"}
        </button>
        <div id="public-feed-content" className="feed-content" data-expanded={feedExpanded}>
          {isLoading ? (
            <p className="feed-message" role="status">Loading sightings for this map area…</p>
          ) : null}
          {error ? (
            <div className="feed-message error-message" role="alert">
              <p>{error} Check your connection, then try again.</p>
              <button type="button" onClick={() => setReloadToken((value) => value + 1)}>
                Retry feed
              </button>
            </div>
          ) : null}
          {!isLoading && !error && reports.length === 0 ? (
            <p className="feed-message">
              No public sightings are visible here yet. Move the map to explore
              another area.
            </p>
          ) : null}
          <ol className="report-list">
            {reports.map((report) => {
              const precision = report.locationPrecisionLabel;
              const date = new Date(report.observedAt).toLocaleDateString();
              const selected = selectedReport?.id === report.id;
              return (
                <li key={report.id}>
                  <button
                    type="button"
                    className="report-list-button"
                    aria-pressed={selected}
                    aria-label={`Show ${report.displayTaxonName}, ${report.ecologicalStatus.replaceAll("_", " ")}, observed ${date}, ${precision}, on the map`}
                    onClick={() => setSelectedReport(report)}
                  >
                    <span className="report-name">{report.displayTaxonName}</span>
                    <span>{report.ecologicalStatus.replaceAll("_", " ")}</span>
                    <span>{date} · {precision}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <span className="sr-only" aria-live="polite">
            {selectedReport ? `${selectedReport.displayTaxonName} selected on the map.` : ""}
          </span>
        </div>
      </aside>
    </div>
  );
}
