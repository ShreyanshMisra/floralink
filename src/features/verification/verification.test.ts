import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInaturalistAdapter } from "@/features/taxonomy/inaturalist";
import type { VerificationRepository } from "./verification";
import {
  TaxonAmbiguousError,
  urgencyForStatus,
  verifyTaxon,
} from "./verification";
import {
  ambiguousAshTaxa,
  emeraldAshBorerTaxon,
} from "@/test/fixtures/inaturalist";

const baseUrl = "https://api.inaturalist.test/v1";
const verificationId = "11111111-1111-4111-8111-111111111111";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function repository(
  status: Awaited<ReturnType<VerificationRepository["findRegionalStatus"]>>,
) {
  return {
    findRegionalStatus: vi.fn().mockResolvedValue(status),
    persistVerification: vi.fn().mockResolvedValue(verificationId),
  } satisfies VerificationRepository;
}

describe("ecological verification", () => {
  it("looks up the exact ID first, keeps occurrence as context, and persists priority status", async () => {
    server.use(
      http.get(`${baseUrl}/taxa/70057`, () =>
        HttpResponse.json({ results: [emeraldAshBorerTaxon] }),
      ),
      http.get(`${baseUrl}/observations`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("radius")).toBe("50");
        expect(url.searchParams.get("taxon_id")).toBe("70057");
        return HttpResponse.json({ total_results: 12, results: [{}] });
      }),
    );
    const repo = repository({
      jurisdiction: "US-MA",
      scientificName: "Agrilus planipennis",
      inaturalistTaxonId: "70057",
      status: "invasive",
      sensitivityLevel: "rounded_public",
      authorityName: "Massachusetts DCR",
      authorityUrl:
        "https://www.mass.gov/guides/emerald-ash-borer-in-massachusetts",
      authorityRecordId: "emerald-ash-borer",
      lastCheckedAt: "2026-08-29T00:00:00Z",
      notes: "Sourced fixture",
    });

    const result = await verifyTaxon(
      {
        inaturalistTaxonId: "70057",
        scientificName: "Agrilus planipennis",
        jurisdiction: "US-MA",
        location: { mode: "point", latitude: 42.36, longitude: -71.06 },
      },
      { inaturalist: createInaturalistAdapter({ baseUrl }), repository: repo },
    );

    expect(repo.findRegionalStatus).toHaveBeenNthCalledWith(1, {
      jurisdiction: "US-MA",
      inaturalistTaxonId: "70057",
      scientificName: undefined,
    });
    expect(result.ecologicalStatus).toBe("invasive");
    expect(result.urgency).toBe("priority");
    expect(result.nearbyObservationCount).toBe(12);
    expect(result.sources.map((source) => source.kind)).toEqual([
      "taxonomy",
      "occurrence",
      "regional_status",
    ]);
    expect(repo.persistVerification).toHaveBeenCalledOnce();
  });

  it("never infers regional status from a high occurrence count", async () => {
    server.use(
      http.get(`${baseUrl}/taxa/70057`, () =>
        HttpResponse.json({ results: [emeraldAshBorerTaxon] }),
      ),
      http.get(`${baseUrl}/observations`, () =>
        HttpResponse.json({ total_results: 9999, results: [{}] }),
      ),
    );
    const repo = repository(null);

    const result = await verifyTaxon(
      {
        inaturalistTaxonId: "70057",
        scientificName: "Agrilus planipennis",
        jurisdiction: "US-MA",
        location: { mode: "point", latitude: 42.36, longitude: -71.06 },
      },
      { inaturalist: createInaturalistAdapter({ baseUrl }), repository: repo },
    );

    expect(result.nearbyObservationCount).toBe(9999);
    expect(result.ecologicalStatus).toBe("unknown");
    expect(result.urgency).toBe("unknown");
    expect(result.sources.some((source) => source.kind === "regional_status")).toBe(
      false,
    );
  });

  it("returns ambiguity when a raw guess has multiple non-exact candidates", async () => {
    server.use(
      http.get(`${baseUrl}/taxa/autocomplete`, () =>
        HttpResponse.json({ results: ambiguousAshTaxa }),
      ),
    );
    const repo = repository(null);

    await expect(
      verifyTaxon(
        {
          rawTaxonGuess: "ash",
          jurisdiction: "US-MA",
        },
        { inaturalist: createInaturalistAdapter({ baseUrl }), repository: repo },
      ),
    ).rejects.toBeInstanceOf(TaxonAmbiguousError);
    expect(repo.persistVerification).not.toHaveBeenCalled();
  });

  it("maps urgency deterministically for every authoritative status", () => {
    expect(urgencyForStatus("regulated_invasive")).toBe("priority");
    expect(urgencyForStatus("invasive")).toBe("priority");
    expect(urgencyForStatus("protected")).toBe("review");
    expect(urgencyForStatus("introduced")).toBe("review");
    expect(urgencyForStatus("native")).toBe("routine");
    expect(urgencyForStatus("common")).toBe("routine");
    expect(urgencyForStatus("unknown")).toBe("unknown");
  });
});
