import { z } from "zod";

import { taxonCandidateSchema } from "@/features/taxonomy/contracts";
import { ecologicalVerificationSchema } from "@/features/verification/contracts";

const normalizedOptionalText = (maximum: number) =>
  z
    .string()
    .transform((value) => value.normalize("NFC").trim().replace(/\s+/g, " "))
    .pipe(z.string().max(maximum));

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);
const roughDescriptionSchema = normalizedOptionalText(500).optional();

export const locationSourceSchema = z.enum([
  "agent_supplied",
  "device",
  "photo_exif",
  "manual_pin",
  "manual_bbox",
  "relative_derived",
]);

export const pointLocationSchema = z.object({
  mode: z.literal("point"),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  accuracyMeters: z.number().min(0).max(100_000).nullable(),
  source: locationSourceSchema.exclude(["manual_bbox"]),
  roughDescription: roughDescriptionSchema,
  reference: z
    .object({
      label: z.string().trim().min(1).max(200),
      latitude: latitudeSchema,
      longitude: longitudeSchema,
      distanceMeters: z.number().min(0).max(100_000),
      bearingDegrees: z.number().min(0).lt(360),
    })
    .optional(),
});

const boundingBoxLocationObjectSchema = z.object({
    mode: z.literal("bounding_box"),
    south: latitudeSchema,
    west: longitudeSchema,
    north: latitudeSchema,
    east: longitudeSchema,
    source: z.enum(["agent_supplied", "manual_bbox"]),
    roughDescription: roughDescriptionSchema,
  });

export const boundingBoxLocationSchema = boundingBoxLocationObjectSchema.superRefine(
  (value, context) => {
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
        message:
          "West must be less than east; antimeridian-crossing boxes are unsupported.",
        path: ["west"],
      });
    }
  },
);

export const unresolvedLocationSchema = z.object({
  mode: z.literal("unresolved"),
  roughDescription: z.string().trim().min(1).max(500),
  reason: z.enum([
    "missing_reference",
    "permission_denied",
    "insufficient_detail",
    "other",
  ]),
});

export const sightingLocationSchema = z
  .discriminatedUnion("mode", [
    pointLocationSchema,
    boundingBoxLocationObjectSchema,
    unresolvedLocationSchema,
  ])
  .superRefine((value, context) => {
    if (value.mode !== "bounding_box") return;
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
        message:
          "West must be less than east; antimeridian-crossing boxes are unsupported.",
        path: ["west"],
      });
    }
  });

export const hostStatusSchema = z.enum([
  "healthy",
  "damaged",
  "dead",
  "unknown",
]);

export const stageSightingInputSchema = z
  .object({
    raw_taxon_guess: z.string().trim().min(1).max(200),
    taxon: taxonCandidateSchema.nullable().optional(),
    identification_confidence: z.number().min(0).max(1).nullable().optional(),
    location: sightingLocationSchema,
    observed_at: z.string().datetime({ offset: true }),
    host_status: hostStatusSchema,
    notes: normalizedOptionalText(2_000).default(""),
    agent_evidence_summary: normalizedOptionalText(2_000).nullable().optional(),
    verification_id: z.string().uuid().optional(),
    verification: ecologicalVerificationSchema.nullable().optional(),
    expected_stage_id: z.string().uuid().optional(),
    expected_revision: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, context) => {
    if (value.verification && !value.verification_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A verification summary must include verification_id.",
        path: ["verification_id"],
      });
    }
    if (
      value.verification &&
      value.verification_id !== value.verification.verificationId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "verification_id must match the verification summary.",
        path: ["verification_id"],
      });
    }
    if (
      (value.expected_stage_id === undefined) !==
      (value.expected_revision === undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expected_stage_id and expected_revision must be supplied together.",
        path: ["expected_revision"],
      });
    }
  });

export type SightingLocation = z.infer<typeof sightingLocationSchema>;
export type HostStatus = z.infer<typeof hostStatusSchema>;
export type StageSightingInput = z.infer<typeof stageSightingInputSchema>;

export const stagedMediaSchema = z.object({
  storagePath: z.string().min(1).max(1024),
  mimeType: z.enum(["image/jpeg", "image/webp"]),
  sizeBytes: z.number().int().positive().max(3 * 1024 * 1024),
  width: z.number().int().positive().max(2048),
  height: z.number().int().positive().max(2048),
});

export const stagedSightingReportSchema = z.object({
  stageId: z.string().uuid(),
  revision: z.number().int().positive(),
  taxon: taxonCandidateSchema.nullable(),
  rawTaxonGuess: z.string(),
  identificationConfidence: z.number().min(0).max(1).nullable(),
  location: sightingLocationSchema,
  observedAt: z.string().datetime(),
  hostStatus: hostStatusSchema,
  notes: z.string(),
  agentEvidenceSummary: z.string().nullable(),
  verification: ecologicalVerificationSchema.nullable(),
  stagedBy: z.enum(["webmcp", "human"]),
  stagedAt: z.string().datetime(),
  lastEditedBy: z.enum(["agent", "human"]),
  acknowledgedApproximateLocation: z.boolean(),
  media: stagedMediaSchema.nullable().default(null),
});

export type StagedSightingReport = z.infer<typeof stagedSightingReportSchema>;

export function getDraftValidationSummary(draft: StagedSightingReport | null) {
  if (!draft) return ["No sighting is staged."];

  const issues: string[] = [];
  if (!draft.rawTaxonGuess.trim()) issues.push("Species guess is required.");
  if (draft.location.mode === "unresolved") {
    issues.push("Location must be resolved by a person before submission.");
  }
  if (Number.isNaN(Date.parse(draft.observedAt))) {
    issues.push("Observation time is invalid.");
  }
  if (new Date(draft.observedAt).getTime() > Date.now() + 5 * 60_000) {
    issues.push("Observation time cannot be in the future.");
  }
  return issues;
}
