import { describe, expect, it } from "vitest";

import { sightingLocationSchema } from "@/features/reports/report-contracts";

describe("sightingLocationSchema", () => {
  it("accepts valid point, bounding-box, and unresolved locations", () => {
    expect(
      sightingLocationSchema.safeParse({
        mode: "point",
        latitude: 42.36,
        longitude: -71.06,
        accuracyMeters: 12,
        source: "device",
      }).success,
    ).toBe(true);
    expect(
      sightingLocationSchema.safeParse({
        mode: "bounding_box",
        south: 42,
        west: -72,
        north: 43,
        east: -71,
        source: "manual_bbox",
      }).success,
    ).toBe(true);
    expect(
      sightingLocationSchema.safeParse({
        mode: "unresolved",
        roughDescription: "Two miles north of an unknown trailhead",
        reason: "missing_reference",
      }).success,
    ).toBe(true);
  });

  it("rejects coordinate bounds and invalid box ordering", () => {
    expect(
      sightingLocationSchema.safeParse({
        mode: "point",
        latitude: 91,
        longitude: -71,
        accuracyMeters: null,
        source: "agent_supplied",
      }).success,
    ).toBe(false);
    const reversed = sightingLocationSchema.safeParse({
      mode: "bounding_box",
      south: 43,
      west: -71,
      north: 42,
      east: -72,
      source: "agent_supplied",
    });
    expect(reversed.success).toBe(false);
    if (!reversed.success) {
      expect(reversed.error.flatten().fieldErrors).toMatchObject({
        south: ["South must be less than north."],
        west: [
          "West must be less than east; antimeridian-crossing boxes are unsupported.",
        ],
      });
    }
  });

  it("rejects invalid accuracy and relative reference precision", () => {
    expect(
      sightingLocationSchema.safeParse({
        mode: "point",
        latitude: 42,
        longitude: -71,
        accuracyMeters: 100_001,
        source: "relative_derived",
        reference: {
          label: "Trailhead",
          latitude: 42,
          longitude: -71,
          distanceMeters: 3_218.688,
          bearingDegrees: 360,
        },
      }).success,
    ).toBe(false);
  });
});
