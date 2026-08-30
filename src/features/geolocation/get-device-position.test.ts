// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DevicePositionError,
  getDevicePosition,
} from "@/features/geolocation/get-device-position";

afterEach(() => vi.restoreAllMocks());

function setSecureContext(value: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value,
  });
}

describe("getDevicePosition", () => {
  it("requires a secure browser context", async () => {
    setSecureContext(false);
    await expect(getDevicePosition()).rejects.toMatchObject({
      code: "POSITION_UNAVAILABLE",
    });
  });

  it("returns browser accuracy and uses the active-resolution options", async () => {
    setSecureContext(true);
    const getCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        _failure?: PositionErrorCallback | null,
        _options?: PositionOptions,
      ) => {
        void _failure;
        void _options;
        success({
          coords: {
            latitude: 42.36,
            longitude: -71.06,
            accuracy: 18,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.parse("2026-08-31T12:00:00Z"),
          toJSON: () => ({}),
        });
      },
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    await expect(getDevicePosition()).resolves.toEqual({
      latitude: 42.36,
      longitude: -71.06,
      accuracyMeters: 18,
      timestamp: "2026-08-31T12:00:00.000Z",
    });
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 60_000,
    });
  });

  it.each([
    [1, "PERMISSION_DENIED"],
    [2, "POSITION_UNAVAILABLE"],
    [3, "TIMEOUT"],
  ] as const)("maps browser error %s to %s", async (browserCode, code) => {
    setSecureContext(true);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: PositionCallback,
          failure: PositionErrorCallback,
        ) =>
          failure({
            code: browserCode,
            message: "browser detail",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    });

    const rejection = getDevicePosition();
    await expect(rejection).rejects.toBeInstanceOf(DevicePositionError);
    await expect(rejection).rejects.toMatchObject({ code });
  });
});
