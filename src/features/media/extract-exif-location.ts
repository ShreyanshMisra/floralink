import exifr from "exifr";

export type ExifLocation = { latitude: number; longitude: number };

export async function extractExifLocation(
  file: Blob,
): Promise<ExifLocation | null> {
  const gps = await exifr.gps(file).catch(() => null);
  if (!gps) return null;

  const { latitude, longitude } = gps;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}
