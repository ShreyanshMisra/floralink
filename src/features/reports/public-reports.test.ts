import { describe, expect, it } from "vitest";

import {
  sanitizeViewportRows,
  toQueryableViewport,
  viewportBoundsSchema,
} from "./public-reports";

const baseRow = {
  report_id: "11111111-1111-4111-8111-111111111111",
  display_taxon_name: "Emerald Ash Borer",
  ecological_status: "invasive",
  urgency: "review",
  location_mode: "point",
  location_geojson: {
    type: "Point",
    coordinates: [-71.058912, 42.360178],
  },
  location_precision_label: "rounded point",
  observed_at: "2026-08-28T12:00:00+00:00",
  has_thumbnail: false,
  created_at: "2026-08-28T12:01:00+00:00",
};

describe("public viewport reports", () => {
  it("rounds public point coordinates and exposes only the allowlisted shape", () => {
    const [report] = sanitizeViewportRows([
      {
        ...baseRow,
        reporter_id: "private-user-id",
        notes: "private notes",
        storage_path: "private/file.jpg",
        accuracy_meters: 1,
      },
    ]);

    expect(report.location).toEqual({
      mode: "point",
      latitude: 42.36,
      longitude: -71.06,
    });
    expect(report).not.toHaveProperty("reporter_id");
    expect(report).not.toHaveProperty("notes");
    expect(report).not.toHaveProperty("storage_path");
    expect(report).not.toHaveProperty("accuracy_meters");
  });

  it("rejects invalid, antimeridian-crossing, and oversized viewports", () => {
    expect(
      viewportBoundsSchema.safeParse({
        south: 43,
        west: -72,
        north: 42,
        east: -70,
      }).success,
    ).toBe(false);
    expect(
      viewportBoundsSchema.safeParse({
        south: 41,
        west: 170,
        north: 43,
        east: -170,
      }).success,
    ).toBe(false);
    expect(
      viewportBoundsSchema.safeParse({
        south: 20,
        west: -80,
        north: 42,
        east: -70,
      }).success,
    ).toBe(false);
  });

  it("rejects more than 200 database rows", () => {
    const rows = Array.from({ length: 201 }, (_, index) => ({
      ...baseRow,
      report_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));

    expect(() => sanitizeViewportRows(rows)).toThrow();
  });
});

describe("toQueryableViewport", () => {
  it("returns null for a zero-size viewport before the map is laid out", () => {
    expect(
      toQueryableViewport({ south: 42.35, west: -72.07, north: 42.35, east: -70.04 }),
    ).toBeNull();
  });

  it("passes a normal viewport through unchanged", () => {
    const bounds = { south: 41.2, west: -73.5, north: 42.9, east: -69.9 };
    expect(toQueryableViewport(bounds)).toEqual(bounds);
  });

  it("clamps an oversized viewport to an accepted window around its center", () => {
    const viewport = toQueryableViewport({ south: 20, west: -100, north: 60, east: -40 });
    expect(viewport).toEqual({ south: 35, west: -75, north: 45, east: -65 });
    expect(viewportBoundsSchema.safeParse(viewport).success).toBe(true);
  });

  it("clamps wrapped longitudes into the valid range", () => {
    const viewport = toQueryableViewport({ south: 10, west: -184, north: 12, east: -178 });
    expect(viewport).toEqual({ south: 10, west: -180, north: 12, east: -178 });
  });
});
