import { z } from "zod";

import {
  boundingBoxLocationSchema,
  hostStatusSchema,
  pointLocationSchema,
  stagedMediaSchema,
} from "@/features/reports/report-contracts";
import { taxonCandidateSchema } from "@/features/taxonomy/contracts";

const normalizedText = (maximum: number) =>
  z.string().transform((value) => value.normalize("NFC").trim()).pipe(z.string().max(maximum));

export const reportSubmissionSchema = z
  .object({
    stageId: z.string().uuid(),
    revision: z.number().int().positive(),
    rawTaxonGuess: normalizedText(200).pipe(z.string().min(1)),
    taxon: taxonCandidateSchema.nullable(),
    identificationConfidence: z.number().min(0).max(1).nullable(),
    location: z.union([pointLocationSchema, boundingBoxLocationSchema]),
    observedAt: z.string().datetime({ offset: true }),
    hostStatus: hostStatusSchema,
    notes: normalizedText(2_000),
    agentEvidenceSummary: normalizedText(1_000).nullable(),
    verificationId: z.string().uuid().nullable(),
    acknowledgedApproximateLocation: z.boolean(),
    humanAcknowledged: z.literal(true),
    media: stagedMediaSchema.nullable(),
  })
  .superRefine((value, context) => {
    const observedAt = new Date(value.observedAt);
    if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > Date.now() + 5 * 60_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Observation time cannot be in the future.",
        path: ["observedAt"],
      });
    }
    if (value.location.mode === "bounding_box" && !value.acknowledgedApproximateLocation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Acknowledge that the location is approximate.",
        path: ["acknowledgedApproximateLocation"],
      });
    }
  });

export const submissionReceiptSchema = z.object({
  receiptId: z.string().uuid(),
  reportId: z.string().uuid(),
  submittedAt: z.string().datetime({ offset: true }),
  publicReport: z.object({
    id: z.string().uuid(),
    displayTaxonName: z.string(),
    ecologicalStatus: z.enum(["regulated_invasive", "invasive", "introduced", "native", "protected", "common", "unknown"]),
    urgency: z.enum(["routine", "review", "priority", "unknown"]),
    location: z.union([
      z.object({ mode: z.literal("point"), latitude: z.coerce.number(), longitude: z.coerce.number() }),
      z.object({ mode: z.literal("bounding_box"), south: z.coerce.number(), west: z.coerce.number(), north: z.coerce.number(), east: z.coerce.number() }),
    ]),
    locationPrecisionLabel: z.string(),
    observedAt: z.string().datetime({ offset: true }),
    hasThumbnail: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
  }),
});

export type ReportSubmission = z.infer<typeof reportSubmissionSchema>;
export type SubmissionReceipt = z.infer<typeof submissionReceiptSchema>;
