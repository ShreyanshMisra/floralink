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
}: {
  onReports: (reports: PublicReport[]) => void;
  onLoading: (loading: boolean) => void;
  onError: (message: string | null) => void;
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
  }, [scheduleLoad]);

  return null;
}

export default function FloraMap() {
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          />
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

      <aside className="feed-panel" aria-labelledby="feed-heading">
        <div className="feed-heading-row">
          <div>
            <p className="eyebrow">Visible area</p>
            <h2 id="feed-heading">Public sightings</h2>
          </div>
          <span className="result-count" aria-live="polite">
            {isLoading ? "Loading…" : `${reports.length} shown`}
          </span>
        </div>
        {error ? <p className="feed-message error-message">{error}</p> : null}
        {!isLoading && !error && reports.length === 0 ? (
          <p className="feed-message">
            No public sightings are visible here yet. Move the map to explore
            another area.
          </p>
        ) : null}
        <ol className="report-list">
          {reports.map((report) => (
            <li key={report.id}>
              <span className="report-name">{report.displayTaxonName}</span>
              <span>{report.ecologicalStatus.replaceAll("_", " ")}</span>
              <span>{new Date(report.observedAt).toLocaleDateString()}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
