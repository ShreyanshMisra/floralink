import { z } from "zod";

import { stageSightingInputSchema } from "@/features/reports/report-contracts";

const locationHintSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const searchTaxaToolInputSchema = z.object({
  query: z.string().trim().min(2).max(120),
  location_hint: locationHintSchema.optional(),
  limit: z.number().int().min(1).max(5).default(5),
});

export const verifyEcologicalRelevanceToolInputSchema = z
  .object({
    inaturalist_taxon_id: z.union([z.string(), z.number()]).optional(),
    scientific_name: z.string().trim().min(2).max(200).optional(),
    species_guess: z.string().trim().min(2).max(200).optional(),
    jurisdiction: z.string().trim().min(2).max(32).default("US-MA"),
    location: locationHintSchema.optional(),
  })
  .superRefine((value, context) => {
    const hasCanonical =
      value.inaturalist_taxon_id !== undefined || value.scientific_name;
    if (hasCanonical && !value.inaturalist_taxon_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A selected taxon requires its iNaturalist taxon ID.",
        path: ["inaturalist_taxon_id"],
      });
    }
    if (hasCanonical && !value.scientific_name) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A selected taxon requires its scientific name.",
        path: ["scientific_name"],
      });
    }
    if (!hasCanonical && !value.species_guess) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a selected taxon or species_guess.",
        path: ["species_guess"],
      });
    }
  });

export const getDeviceLocationToolInputSchema = z.object({
  purpose_acknowledged: z.literal(true),
});

export { stageSightingInputSchema };

const numberSchema = { type: "number" } as const;
const nullableNumberSchema = { type: ["number", "null"] } as const;
const nullableStringSchema = { type: ["string", "null"] } as const;

export const locationHintJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["latitude", "longitude"],
  properties: {
    latitude: { type: "number", minimum: -90, maximum: 90 },
    longitude: { type: "number", minimum: -180, maximum: 180 },
  },
} as const;

export const taxonCandidateJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "inaturalistTaxonId",
    "scientificName",
    "commonName",
    "rank",
    "matchScore",
    "matchedName",
    "imageUrl",
    "sourceUrl",
  ],
  properties: {
    inaturalistTaxonId: { type: "string", minLength: 1 },
    scientificName: { type: "string", minLength: 1 },
    commonName: nullableStringSchema,
    rank: nullableStringSchema,
    matchScore: { type: ["number", "null"], minimum: 0, maximum: 1 },
    matchedName: { type: "string", minLength: 1 },
    imageUrl: nullableStringSchema,
    sourceUrl: { type: "string", format: "uri" },
  },
} as const;

export const ecologicalVerificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "verificationId",
    "state",
    "taxon",
    "jurisdiction",
    "ecologicalStatus",
    "sensitivityLevel",
    "urgency",
    "nearbyObservationCount",
    "nearbyRadiusKm",
    "warnings",
    "sources",
  ],
  properties: {
    verificationId: { type: "string", format: "uuid" },
    state: {
      enum: ["verified", "ambiguous", "not_found", "unavailable", "not_requested"],
    },
    taxon: { anyOf: [taxonCandidateJsonSchema, { type: "null" }] },
    jurisdiction: { type: "string" },
    ecologicalStatus: {
      enum: [
        "regulated_invasive",
        "invasive",
        "introduced",
        "native",
        "protected",
        "common",
        "unknown",
      ],
    },
    sensitivityLevel: { enum: ["rounded_public", "private"] },
    urgency: { enum: ["routine", "review", "priority", "unknown"] },
    nearbyObservationCount: { type: ["integer", "null"], minimum: 0 },
    nearbyRadiusKm: nullableNumberSchema,
    warnings: { type: "array", items: { type: "string" } },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "url", "kind", "retrievedAt"],
        properties: {
          name: { type: "string" },
          url: { type: "string", format: "uri" },
          kind: { enum: ["taxonomy", "occurrence", "regional_status"] },
          retrievedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
} as const;

export const sightingLocationJsonSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["mode", "latitude", "longitude", "accuracyMeters", "source"],
      properties: {
        mode: { const: "point" },
        latitude: { type: "number", minimum: -90, maximum: 90 },
        longitude: { type: "number", minimum: -180, maximum: 180 },
        accuracyMeters: {
          type: ["number", "null"],
          minimum: 0,
          maximum: 100000,
        },
        source: {
          enum: [
            "agent_supplied",
            "device",
            "photo_exif",
            "manual_pin",
            "relative_derived",
          ],
        },
        roughDescription: { type: "string", maxLength: 500 },
        reference: {
          type: "object",
          additionalProperties: false,
          required: [
            "label",
            "latitude",
            "longitude",
            "distanceMeters",
            "bearingDegrees",
          ],
          properties: {
            label: { type: "string", minLength: 1, maxLength: 200 },
            latitude: { type: "number", minimum: -90, maximum: 90 },
            longitude: { type: "number", minimum: -180, maximum: 180 },
            distanceMeters: { type: "number", minimum: 0, maximum: 100000 },
            bearingDegrees: { type: "number", minimum: 0, exclusiveMaximum: 360 },
          },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["mode", "south", "west", "north", "east", "source"],
      properties: {
        mode: { const: "bounding_box" },
        south: { type: "number", minimum: -90, maximum: 90 },
        west: { type: "number", minimum: -180, maximum: 180 },
        north: { type: "number", minimum: -90, maximum: 90 },
        east: { type: "number", minimum: -180, maximum: 180 },
        source: { enum: ["agent_supplied", "manual_bbox"] },
        roughDescription: { type: "string", maxLength: 500 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["mode", "roughDescription", "reason"],
      properties: {
        mode: { const: "unresolved" },
        roughDescription: { type: "string", minLength: 1, maxLength: 500 },
        reason: {
          enum: ["missing_reference", "permission_denied", "insufficient_detail", "other"],
        },
      },
    },
  ],
} as const;

export const stagedSightingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "stageId",
    "revision",
    "taxon",
    "rawTaxonGuess",
    "identificationConfidence",
    "location",
    "observedAt",
    "hostStatus",
    "notes",
    "agentEvidenceSummary",
    "verification",
    "stagedBy",
    "stagedAt",
    "lastEditedBy",
    "acknowledgedApproximateLocation",
  ],
  properties: {
    stageId: { type: "string", format: "uuid" },
    revision: { type: "integer", minimum: 1 },
    taxon: { anyOf: [taxonCandidateJsonSchema, { type: "null" }] },
    rawTaxonGuess: { type: "string" },
    identificationConfidence: {
      type: ["number", "null"],
      minimum: 0,
      maximum: 1,
    },
    location: sightingLocationJsonSchema,
    observedAt: { type: "string", format: "date-time" },
    hostStatus: { enum: ["healthy", "damaged", "dead", "unknown"] },
    notes: { type: "string" },
    agentEvidenceSummary: nullableStringSchema,
    verification: {
      anyOf: [ecologicalVerificationJsonSchema, { type: "null" }],
    },
    stagedBy: { enum: ["webmcp", "human"] },
    stagedAt: { type: "string", format: "date-time" },
    lastEditedBy: { enum: ["agent", "human"] },
    acknowledgedApproximateLocation: { type: "boolean" },
  },
} as const;

export const webMcpToolSchemas = {
  search_taxa: {
    input: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 2, maxLength: 120 },
        location_hint: locationHintJsonSchema,
        limit: { type: "integer", minimum: 1, maximum: 5, default: 5 },
      },
    },
    output: {
      type: "object",
      required: ["ok"],
      properties: {
        ok: { type: "boolean" },
        data: { type: "array", maxItems: 5, items: taxonCandidateJsonSchema },
        error: { type: "object" },
      },
    },
  },
  verify_ecological_relevance: {
    input: {
      type: "object",
      additionalProperties: false,
      anyOf: [
        { required: ["inaturalist_taxon_id", "scientific_name"] },
        { required: ["species_guess"] },
      ],
      properties: {
        inaturalist_taxon_id: { anyOf: [{ type: "string" }, numberSchema] },
        scientific_name: { type: "string", minLength: 2, maxLength: 200 },
        species_guess: { type: "string", minLength: 2, maxLength: 200 },
        jurisdiction: { type: "string", minLength: 2, maxLength: 32, default: "US-MA" },
        location: locationHintJsonSchema,
      },
    },
    output: {
      type: "object",
      required: ["ok"],
      properties: {
        ok: { type: "boolean" },
        data: ecologicalVerificationJsonSchema,
        error: { type: "object" },
      },
    },
  },
  get_device_location: {
    input: {
      type: "object",
      additionalProperties: false,
      required: ["purpose_acknowledged"],
      properties: { purpose_acknowledged: { const: true } },
    },
    output: {
      type: "object",
      required: ["ok"],
      properties: {
        ok: { type: "boolean" },
        data: {
          type: "object",
          required: ["latitude", "longitude", "accuracyMeters", "timestamp"],
          properties: {
            latitude: numberSchema,
            longitude: numberSchema,
            accuracyMeters: numberSchema,
            timestamp: { type: "string", format: "date-time" },
          },
        },
        error: { type: "object" },
      },
    },
  },
  stage_sighting_report: {
    input: {
      type: "object",
      additionalProperties: false,
      required: ["raw_taxon_guess", "location", "observed_at", "host_status"],
      properties: {
        raw_taxon_guess: { type: "string", minLength: 1, maxLength: 200 },
        taxon: { anyOf: [taxonCandidateJsonSchema, { type: "null" }] },
        identification_confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
        location: sightingLocationJsonSchema,
        observed_at: { type: "string", format: "date-time" },
        host_status: { enum: ["healthy", "damaged", "dead", "unknown"] },
        notes: { type: "string", maxLength: 2000, default: "" },
        agent_evidence_summary: nullableStringSchema,
        verification_id: { type: "string", format: "uuid" },
        verification: {
          anyOf: [ecologicalVerificationJsonSchema, { type: "null" }],
        },
        expected_stage_id: { type: "string", format: "uuid" },
        expected_revision: { type: "integer", minimum: 0 },
      },
    },
    output: {
      type: "object",
      required: ["ok"],
      properties: {
        ok: { type: "boolean" },
        stageId: { type: "string", format: "uuid" },
        revision: { type: "integer", minimum: 1 },
        missingOrUncertainFields: { type: "array", items: { type: "string" } },
        message: { type: "string" },
        error: { type: "object" },
      },
    },
  },
  get_staged_sighting: {
    input: { type: "object", additionalProperties: false, properties: {} },
    output: {
      type: "object",
      required: ["ok", "draft", "missingOrUncertainFields"],
      properties: {
        ok: { type: "boolean" },
        draft: { anyOf: [stagedSightingJsonSchema, { type: "null" }] },
        missingOrUncertainFields: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;
