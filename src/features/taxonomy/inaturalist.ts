import { z } from "zod";

import {
  deduplicateTaxonCandidates,
  type TaxonCandidate,
} from "@/features/taxonomy/contracts";

export const INATURALIST_TIMEOUT_MS = 5_000;
export const INATURALIST_REVALIDATE_SECONDS = 86_400;
export const INATURALIST_ADAPTER_VERSION = "inaturalist-v1-2026-08-30";

const DEFAULT_BASE_URL = "https://api.inaturalist.org/v1";
const DEFAULT_USER_AGENT =
  "FloraLink/0.1.0 (+https://floralinkmcp.vercel.app; biodiversity verification)";

const photoSchema = z
  .object({
    medium_url: z.string().url().optional().nullable(),
  })
  .nullable()
  .optional();

const rawTaxonSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  preferred_common_name: z.string().min(1).optional().nullable(),
  rank: z.string().min(1).optional().nullable(),
  matched_term: z.string().min(1).optional().nullable(),
  score: z.number().optional().nullable(),
  default_photo: photoSchema,
});

const taxaResponseSchema = z.object({
  results: z.array(rawTaxonSchema),
});

const observationsResponseSchema = z.object({
  total_results: z.number().int().nonnegative(),
  results: z.array(z.unknown()),
});

export class InaturalistUnavailableError extends Error {
  constructor(message = "iNaturalist is unavailable.", options?: ErrorOptions) {
    super(message, options);
    this.name = "InaturalistUnavailableError";
  }
}

export interface TaxonSearchOptions {
  query: string;
  latitude?: number;
  longitude?: number;
  locale?: string;
  limit?: number;
}

export type OccurrenceLocation =
  | { mode: "point"; latitude: number; longitude: number }
  | {
      mode: "bounding_box";
      south: number;
      west: number;
      north: number;
      east: number;
    };

export interface OccurrenceContext {
  count: number;
  radiusKm: number | null;
  sourceUrl: string;
  retrievedAt: string;
}

interface InaturalistAdapterOptions {
  baseUrl?: string;
  userAgent?: string;
  fetchImplementation?: typeof fetch;
}

function mapRawTaxon(rawTaxon: z.infer<typeof rawTaxonSchema>): TaxonCandidate {
  const imageUrl = rawTaxon.default_photo?.medium_url;
  const matchScore =
    typeof rawTaxon.score === "number" &&
    rawTaxon.score >= 0 &&
    rawTaxon.score <= 1
      ? rawTaxon.score
      : null;

  return {
    inaturalistTaxonId: String(rawTaxon.id),
    scientificName: rawTaxon.name,
    commonName: rawTaxon.preferred_common_name ?? null,
    rank: rawTaxon.rank ?? null,
    matchScore,
    matchedName: rawTaxon.matched_term ?? rawTaxon.name,
    imageUrl: imageUrl?.startsWith("https://") ? imageUrl : null,
    sourceUrl: `https://www.inaturalist.org/taxa/${rawTaxon.id}`,
  };
}

export function createInaturalistAdapter(
  options: InaturalistAdapterOptions = {},
) {
  const baseUrl = (options.baseUrl ?? process.env.INATURALIST_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const fetchImplementation = options.fetchImplementation ?? fetch;

  async function getJson(path: string, searchParams: URLSearchParams) {
    const requestUrl = new URL(`${baseUrl}${path}`);
    requestUrl.search = searchParams.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), INATURALIST_TIMEOUT_MS);

    try {
      const response = await fetchImplementation(requestUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent,
        },
        signal: controller.signal,
        next: { revalidate: INATURALIST_REVALIDATE_SECONDS },
      });

      if (!response.ok) {
        throw new InaturalistUnavailableError(
          `iNaturalist returned HTTP ${response.status}.`,
        );
      }

      try {
        return { payload: await response.json(), sourceUrl: requestUrl.toString() };
      } catch (error) {
        throw new InaturalistUnavailableError(
          "iNaturalist returned malformed JSON.",
          { cause: error },
        );
      }
    } catch (error) {
      if (error instanceof InaturalistUnavailableError) {
        throw error;
      }

      throw new InaturalistUnavailableError("iNaturalist request failed.", {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async searchTaxa({
      query,
      latitude,
      longitude,
      locale = "en",
      limit = 5,
    }: TaxonSearchOptions) {
      const searchParams = new URLSearchParams({
        q: query,
        per_page: String(Math.min(5, Math.max(1, limit))),
        locale,
      });

      if (latitude !== undefined && longitude !== undefined) {
        searchParams.set("lat", String(latitude));
        searchParams.set("lng", String(longitude));
      }

      const { payload } = await getJson("/taxa/autocomplete", searchParams);
      const parsed = taxaResponseSchema.safeParse(payload);

      if (!parsed.success) {
        throw new InaturalistUnavailableError(
          "iNaturalist returned an unexpected taxa response.",
        );
      }

      return deduplicateTaxonCandidates(
        parsed.data.results.map(mapRawTaxon),
        limit,
      );
    },

    async getTaxon(taxonId: string) {
      const { payload } = await getJson(
        `/taxa/${encodeURIComponent(taxonId)}`,
        new URLSearchParams(),
      );
      const parsed = taxaResponseSchema.safeParse(payload);

      if (!parsed.success) {
        throw new InaturalistUnavailableError(
          "iNaturalist returned an unexpected taxon response.",
        );
      }

      if (!parsed.data.results[0]) {
        return null;
      }

      const candidate = mapRawTaxon(parsed.data.results[0]);
      if (candidate.inaturalistTaxonId !== taxonId) {
        throw new InaturalistUnavailableError(
          "iNaturalist returned a mismatched taxon response.",
        );
      }

      return candidate;
    },

    async getOccurrenceContext(
      taxonId: string,
      location: OccurrenceLocation,
    ): Promise<OccurrenceContext> {
      const searchParams = new URLSearchParams({
        taxon_id: taxonId,
        per_page: "1",
      });

      if (location.mode === "point") {
        searchParams.set("lat", String(location.latitude));
        searchParams.set("lng", String(location.longitude));
        searchParams.set("radius", "50");
      } else {
        searchParams.set("swlat", String(location.south));
        searchParams.set("swlng", String(location.west));
        searchParams.set("nelat", String(location.north));
        searchParams.set("nelng", String(location.east));
      }

      const { payload, sourceUrl } = await getJson(
        "/observations",
        searchParams,
      );
      const parsed = observationsResponseSchema.safeParse(payload);

      if (!parsed.success) {
        throw new InaturalistUnavailableError(
          "iNaturalist returned an unexpected observations response.",
        );
      }

      return {
        count: parsed.data.total_results,
        radiusKm: location.mode === "point" ? 50 : null,
        sourceUrl,
        retrievedAt: new Date().toISOString(),
      };
    },
  };
}

export type InaturalistAdapter = ReturnType<typeof createInaturalistAdapter>;
