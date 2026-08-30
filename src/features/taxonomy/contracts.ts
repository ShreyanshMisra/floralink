import { z } from "zod";

const normalizedText = (minimum: number, maximum: number) =>
  z
    .string()
    .transform((value) => value.normalize("NFC").trim().replace(/\s+/g, " "))
    .pipe(z.string().min(minimum).max(maximum));

export const taxonCandidateSchema = z.object({
  inaturalistTaxonId: z.string().min(1),
  scientificName: z.string().min(1),
  commonName: z.string().nullable(),
  rank: z.string().nullable(),
  matchScore: z.number().min(0).max(1).nullable(),
  matchedName: z.string().min(1),
  imageUrl: z.string().url().startsWith("https://").nullable(),
  sourceUrl: z.string().url().startsWith("https://"),
});

export type TaxonCandidate = z.infer<typeof taxonCandidateSchema>;

export const taxonSearchQuerySchema = z
  .object({
    q: normalizedText(2, 120),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    locale: normalizedText(2, 16).default("en"),
    limit: z.coerce
      .number()
      .int()
      .transform((value) => Math.min(5, Math.max(1, value)))
      .default(5),
  })
  .superRefine((value, context) => {
    if ((value.lat === undefined) !== (value.lng === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Latitude and longitude must be provided together.",
        path: value.lat === undefined ? ["lat"] : ["lng"],
      });
    }
  });

export function normalizeTaxonComparisonKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function deduplicateTaxonCandidates(
  candidates: TaxonCandidate[],
  limit = 5,
) {
  const seenIds = new Set<string>();
  const deduplicated: TaxonCandidate[] = [];

  for (const candidate of candidates) {
    if (seenIds.has(candidate.inaturalistTaxonId)) {
      continue;
    }

    seenIds.add(candidate.inaturalistTaxonId);
    deduplicated.push(candidate);

    if (deduplicated.length === Math.min(5, Math.max(1, limit))) {
      break;
    }
  }

  return deduplicated;
}
