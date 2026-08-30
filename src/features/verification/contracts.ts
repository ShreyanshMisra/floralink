import { z } from "zod";

import { taxonCandidateSchema } from "@/features/taxonomy/contracts";

const normalizedText = (minimum: number, maximum: number) =>
  z
    .string()
    .transform((value) => value.normalize("NFC").trim().replace(/\s+/g, " "))
    .pipe(z.string().min(minimum).max(maximum));

const pointLocationSchema = z.object({
  mode: z.literal("point"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const boundingBoxLocationSchema = z.object({
  mode: z.literal("bounding_box"),
  south: z.number().min(-90).max(90),
  west: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
});

const verificationLocationSchema = z
  .discriminatedUnion("mode", [pointLocationSchema, boundingBoxLocationSchema])
  .superRefine((value, context) => {
    if (value.mode !== "bounding_box") {
      return;
    }

    if (value.south >= value.north) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "South must be less than north.",
        path: ["south"],
      });
    }
    if (value.west >= value.east) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "West must be less than east. Antimeridian boxes are unsupported.",
        path: ["west"],
      });
    }
  });

export const verificationRequestSchema = z
  .object({
    inaturalistTaxonId: z
      .union([z.string(), z.number().int().nonnegative()])
      .transform(String)
      .optional(),
    scientificName: normalizedText(2, 200).optional(),
    rawTaxonGuess: normalizedText(2, 200).optional(),
    jurisdiction: normalizedText(2, 32).default("US-MA"),
    location: verificationLocationSchema.optional(),
    hostStatus: z.enum(["healthy", "damaged", "dead", "unknown"]).optional(),
    identificationConfidence: z.number().min(0).max(1).nullable().optional(),
  })
  .superRefine((value, context) => {
    const hasSelectedTaxon =
      value.inaturalistTaxonId !== undefined || value.scientificName !== undefined;

    if (hasSelectedTaxon) {
      if (!value.inaturalistTaxonId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A selected taxon requires its iNaturalist ID.",
          path: ["inaturalistTaxonId"],
        });
      }
      if (!value.scientificName) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A selected taxon requires its scientific name.",
          path: ["scientificName"],
        });
      }
    } else if (!value.rawTaxonGuess) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a selected taxon or a raw taxon guess.",
        path: ["rawTaxonGuess"],
      });
    }
  });

export type VerificationRequest = z.infer<typeof verificationRequestSchema>;

export const ecologicalStatusSchema = z.enum([
  "regulated_invasive",
  "invasive",
  "introduced",
  "native",
  "protected",
  "common",
  "unknown",
]);

export type EcologicalStatus = z.infer<typeof ecologicalStatusSchema>;
export type SensitivityLevel = "rounded_public" | "private";
export type Urgency = "routine" | "review" | "priority" | "unknown";

export const ecologicalVerificationSchema = z.object({
  verificationId: z.string().uuid(),
  state: z.enum([
    "verified",
    "ambiguous",
    "not_found",
    "unavailable",
    "not_requested",
  ]),
  taxon: taxonCandidateSchema.nullable(),
  jurisdiction: z.string(),
  ecologicalStatus: ecologicalStatusSchema,
  sensitivityLevel: z.enum(["rounded_public", "private"]),
  urgency: z.enum(["routine", "review", "priority", "unknown"]),
  nearbyObservationCount: z.number().int().nonnegative().nullable(),
  nearbyRadiusKm: z.number().nonnegative().nullable(),
  warnings: z.array(z.string()),
  sources: z.array(
    z.object({
      name: z.string(),
      url: z.string().url().startsWith("https://"),
      kind: z.enum(["taxonomy", "occurrence", "regional_status"]),
      retrievedAt: z.string().datetime(),
    }),
  ),
});

export type EcologicalVerification = z.infer<
  typeof ecologicalVerificationSchema
>;
