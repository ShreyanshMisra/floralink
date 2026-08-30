import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ambiguousAshTaxa,
  emeraldAshBorerTaxon,
} from "@/test/fixtures/inaturalist";

const repository = vi.hoisted(() => ({
  findRegionalStatus: vi.fn(),
  persistVerification: vi.fn(),
}));

vi.mock(
  "@/features/verification/supabase-verification-repository",
  () => ({
    createSupabaseVerificationRepository: () => repository,
  }),
);

import { POST } from "./route";

const baseUrl = "https://api.inaturalist.org/v1";
const verificationId = "11111111-1111-4111-8111-111111111111";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  repository.findRegionalStatus.mockReset();
  repository.persistVerification.mockReset();
  repository.persistVerification.mockResolvedValue(verificationId);
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function request(body: unknown) {
  return new NextRequest("http://localhost/api/verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/verification", () => {
  it("returns and persists an exact authoritative verification", async () => {
    repository.findRegionalStatus.mockResolvedValue({
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
    server.use(
      http.get(`${baseUrl}/taxa/70057`, () =>
        HttpResponse.json({ results: [emeraldAshBorerTaxon] }),
      ),
      http.get(`${baseUrl}/observations`, () =>
        HttpResponse.json({ total_results: 4, results: [{}] }),
      ),
    );

    const response = await POST(
      request({
        inaturalistTaxonId: "70057",
        scientificName: "Agrilus planipennis",
        jurisdiction: "US-MA",
        location: { mode: "point", latitude: 42.36, longitude: -71.06 },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      verificationId,
      ecologicalStatus: "invasive",
      urgency: "priority",
      nearbyObservationCount: 4,
      nearbyRadiusKm: 50,
    });
    expect(repository.persistVerification).toHaveBeenCalledOnce();
  });

  it("returns TAXON_AMBIGUOUS without persisting a raw ambiguous guess", async () => {
    repository.findRegionalStatus.mockResolvedValue(null);
    server.use(
      http.get(`${baseUrl}/taxa/autocomplete`, () =>
        HttpResponse.json({ results: ambiguousAshTaxa }),
      ),
    );

    const response = await POST(
      request({ rawTaxonGuess: "ash", jurisdiction: "US-MA" }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("TAXON_AMBIGUOUS");
    expect(repository.persistVerification).not.toHaveBeenCalled();
  });
});
