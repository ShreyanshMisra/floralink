export type DevicePositionErrorCode =
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT";

export class DevicePositionError extends Error {
  constructor(
    public readonly code: DevicePositionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DevicePositionError";
  }
}

export interface DevicePosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  timestamp: string;
}

export function getDevicePosition(): Promise<DevicePosition> {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return Promise.reject(
      new DevicePositionError(
        "POSITION_UNAVAILABLE",
        "Device location requires a secure HTTPS browser context.",
      ),
    );
  }
  if (!navigator.geolocation) {
    return Promise.reject(
      new DevicePositionError(
        "POSITION_UNAVAILABLE",
        "Device location is unavailable in this browser.",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString(),
        }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(
            new DevicePositionError(
              "PERMISSION_DENIED",
              "Location permission was denied. Choose another location method.",
            ),
          );
          return;
        }
        if (error.code === error.TIMEOUT) {
          reject(
            new DevicePositionError(
              "TIMEOUT",
              "Device location timed out. Try again or choose another method.",
            ),
          );
          return;
        }
        reject(
          new DevicePositionError(
            "POSITION_UNAVAILABLE",
            "The browser could not determine the device location.",
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
