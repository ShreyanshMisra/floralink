"use client";

import { useEffect } from "react";
import { CircleMarker, Pane, Popup, Rectangle, useMap, useMapEvents } from "react-leaflet";

import { reportDraftStore, useReportDraftStore } from "@/features/reports/report-draft-store";

export function StagedLocationLayer() {
  const draft = useReportDraftStore((state) => state.draft);
  const editMode = useReportDraftStore((state) => state.locationEditMode);
  const map = useMap();
  const stagedLocation = draft?.location;

  useMapEvents({
    click(event) {
      reportDraftStore
        .getState()
        .handleMapLocationClick(event.latlng.lat, event.latlng.lng);
    },
  });

  useEffect(() => {
    if (!stagedLocation || stagedLocation.mode === "unresolved") return;
    if (stagedLocation.mode === "point") {
      map.flyTo(
        [stagedLocation.latitude, stagedLocation.longitude],
        Math.max(map.getZoom(), 14),
        { animate: false },
      );
      return;
    }
    map.fitBounds(
      [
        [stagedLocation.south, stagedLocation.west],
        [stagedLocation.north, stagedLocation.east],
      ],
      { padding: [28, 28], maxZoom: 15, animate: false },
    );
  }, [stagedLocation, map]);

  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = editMode === "idle" ? "" : "crosshair";
    return () => {
      container.style.cursor = "";
    };
  }, [editMode, map]);

  if (!draft || draft.location.mode === "unresolved") return null;

  return (
    <Pane name="staged-sighting" style={{ zIndex: 650 }}>
      {draft.location.mode === "point" ? (
        <CircleMarker
          center={[draft.location.latitude, draft.location.longitude]}
          radius={10}
          pathOptions={{ color: "#7c2d12", fillColor: "#fb923c", fillOpacity: 0.9, weight: 3 }}
        >
          <Popup>Staged draft · not submitted</Popup>
        </CircleMarker>
      ) : (
        <Rectangle
          bounds={[
            [draft.location.south, draft.location.west],
            [draft.location.north, draft.location.east],
          ]}
          pathOptions={{ color: "#7c2d12", dashArray: "8 5", fillColor: "#fb923c", fillOpacity: 0.2, weight: 4 }}
        >
          <Popup>Staged approximate area · not submitted</Popup>
        </Rectangle>
      )}
    </Pane>
  );
}
