import { describe, expect, it } from "vitest";

import { deriveRelativePoint } from "@/features/geolocation/derive-relative-point";

describe("deriveRelativePoint", () => {
  it("derives known one-kilometer cardinal destinations at the equator", () => {
    const north = deriveRelativePoint({
      latitude: 0,
      longitude: 0,
      distanceMeters: 1_000,
      bearingDegrees: 0,
    });
    const east = deriveRelativePoint({
      latitude: 0,
      longitude: 0,
      distanceMeters: 1_000,
      bearingDegrees: 90,
    });

    expect(north.latitude).toBeCloseTo(0.0089932, 6);
    expect(north.longitude).toBeCloseTo(0, 8);
    expect(east.latitude).toBeCloseTo(0, 8);
    expect(east.longitude).toBeCloseTo(0.0089932, 6);
  });

  it("normalizes a destination across the antimeridian", () => {
    const result = deriveRelativePoint({
      latitude: 0,
      longitude: 179.9,
      distanceMeters: 20_000,
      bearingDegrees: 90,
    });

    expect(result.longitude).toBeLessThan(-179.9);
  });

  it("rejects invalid references, distances, and bearings", () => {
    expect(() =>
      deriveRelativePoint({
        latitude: 91,
        longitude: 0,
        distanceMeters: 1,
        bearingDegrees: 0,
      }),
    ).toThrow(/Latitude/);
    expect(() =>
      deriveRelativePoint({
        latitude: 0,
        longitude: 0,
        distanceMeters: 100_001,
        bearingDegrees: 0,
      }),
    ).toThrow(/Distance/);
    expect(() =>
      deriveRelativePoint({
        latitude: 0,
        longitude: 0,
        distanceMeters: 1,
        bearingDegrees: 360,
      }),
    ).toThrow(/Bearing/);
  });
});
