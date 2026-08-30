import { z } from "zod";

export const viewportBoundsSchema = z
  .object({
    south: z.coerce.number().min(-90).max(90),
    west: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
  })
  .superRefine((bounds, context) => {
    if (bounds.south >= bounds.north) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "south must be less than north",
        path: ["south"],
      });
    }

    if (bounds.west >= bounds.east) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "west must be less than east. Antimeridian viewports are unsupported",
        path: ["west"],
      });
    }

    if (bounds.north - bounds.south > 10 || bounds.east - bounds.west > 10) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "viewport is too large",
        path: ["north"],
      });
    }
  });

const pointGeoJsonSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

const polygonGeoJsonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
});

const rawViewportRowSchema = z.object({
  report_id: z.string().uuid(),
  display_taxon_name: z.string(),
  ecological_status: z.enum([
    "regulated_invasive",
    "invasive",
    "introduced",
    "native",
    "protected",
    "common",
    "unknown",
  ]),
  urgency: z.enum(["routine", "review", "priority", "unknown"]),
  location_mode: z.enum(["point", "bounding_box"]),
  location_geojson: z.union([pointGeoJsonSchema, polygonGeoJsonSchema]),
  location_precision_label: z.string(),
  observed_at: z.string().datetime({ offset: true }),
  has_thumbnail: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
});

export type ViewportBounds = z.infer<typeof viewportBoundsSchema>;

export type PublicReport = {
  id: string;
  displayTaxonName: string;
  ecologicalStatus: z.infer<typeof rawViewportRowSchema>["ecological_status"];
  urgency: z.infer<typeof rawViewportRowSchema>["urgency"];
  location:
    | { mode: "point"; latitude: number; longitude: number }
    | {
        mode: "bounding_box";
        south: number;
        west: number;
        north: number;
        east: number;
      };
  locationPrecisionLabel: string;
  observedAt: string;
  hasThumbnail: boolean;
  createdAt: string;
};

function roundPublicCoordinate(value: number) {
  return Number(value.toFixed(2));
}

export function sanitizeViewportRows(input: unknown): PublicReport[] {
  const rows = z.array(rawViewportRowSchema).max(200).parse(input);

  return rows.map((row) => {
    const base = {
      id: row.report_id,
      displayTaxonName: row.display_taxon_name,
      ecologicalStatus: row.ecological_status,
      urgency: row.urgency,
      locationPrecisionLabel: row.location_precision_label,
      observedAt: row.observed_at,
      hasThumbnail: row.has_thumbnail,
      createdAt: row.created_at,
    };

    if (row.location_mode === "point" && row.location_geojson.type === "Point") {
      const [longitude, latitude] = row.location_geojson.coordinates;
      return {
        ...base,
        location: {
          mode: "point" as const,
          latitude: roundPublicCoordinate(latitude),
          longitude: roundPublicCoordinate(longitude),
        },
      };
    }

    if (
      row.location_mode === "bounding_box" &&
      row.location_geojson.type === "Polygon"
    ) {
      const coordinates = row.location_geojson.coordinates.flat();
      const longitudes = coordinates.map(([longitude]) => longitude);
      const latitudes = coordinates.map(([, latitude]) => latitude);
      return {
        ...base,
        location: {
          mode: "bounding_box" as const,
          south: roundPublicCoordinate(Math.min(...latitudes)),
          west: roundPublicCoordinate(Math.min(...longitudes)),
          north: roundPublicCoordinate(Math.max(...latitudes)),
          east: roundPublicCoordinate(Math.max(...longitudes)),
        },
      };
    }

    throw new Error("Viewport row location does not match its location mode.");
  });
}
