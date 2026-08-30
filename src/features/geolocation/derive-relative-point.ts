const EARTH_RADIUS_METERS = 6_371_008.8;

export interface RelativePointInput {
  latitude: number;
  longitude: number;
  distanceMeters: number;
  bearingDegrees: number;
}

export function deriveRelativePoint(input: RelativePointInput) {
  const { latitude, longitude, distanceMeters, bearingDegrees } = input;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError("Latitude must be between -90 and 90 degrees.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError("Longitude must be between -180 and 180 degrees.");
  }
  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0 ||
    distanceMeters > 100_000
  ) {
    throw new RangeError("Distance must be between 0 and 100000 meters.");
  }
  if (
    !Number.isFinite(bearingDegrees) ||
    bearingDegrees < 0 ||
    bearingDegrees >= 360
  ) {
    throw new RangeError("Bearing must be at least 0 and less than 360 degrees.");
  }

  const toRadians = Math.PI / 180;
  const toDegrees = 180 / Math.PI;
  const latitudeRadians = latitude * toRadians;
  const longitudeRadians = longitude * toRadians;
  const bearingRadians = bearingDegrees * toRadians;
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;

  const destinationLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance) +
      Math.cos(latitudeRadians) *
        Math.sin(angularDistance) *
        Math.cos(bearingRadians),
  );
  const destinationLongitude =
    longitudeRadians +
    Math.atan2(
      Math.sin(bearingRadians) *
        Math.sin(angularDistance) *
        Math.cos(latitudeRadians),
      Math.cos(angularDistance) -
        Math.sin(latitudeRadians) * Math.sin(destinationLatitude),
    );

  return {
    latitude: destinationLatitude * toDegrees,
    longitude:
      ((destinationLongitude * toDegrees + 540) % 360) - 180,
  };
}
