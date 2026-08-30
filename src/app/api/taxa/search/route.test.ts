import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { GET } from "./route";
import {
  ambiguousAshTaxa,
  emeraldAshBorerTaxon,
} from "@/test/fixtures/inaturalist";

const inaturalistUrl = "https://api.inaturalist.org/v1/taxa/autocomplete";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function request(query: string) {
  return new NextRequest(`http://localhost/api/taxa/search?${query}`);
}

describe("GET /api/taxa/search", () => {
  it("returns normalized ambiguous candidates without selecting one", async () => {
    server.use(
      http.get(inaturalistUrl, () =>
        HttpResponse.json({ results: ambiguousAshTaxa }),
      ),
    );

    const response = await GET(request("q=ash&limit=99"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].inaturalistTaxonId).toBe("70057");
  });

  it("returns TAXON_NOT_FOUND for an empty usable result", async () => {
    server.use(
      http.get(inaturalistUrl, () => HttpResponse.json({ results: [] })),
    );

    const response = await GET(request("q=missing"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("TAXON_NOT_FOUND");
    expect(body.error.retryable).toBe(false);
  });

  it("returns UPSTREAM_UNAVAILABLE for malformed upstream data", async () => {
    server.use(
      http.get(inaturalistUrl, () =>
        HttpResponse.json({ results: [{ ...emeraldAshBorerTaxon, id: null }] }),
      ),
    );

    const response = await GET(request("q=emerald+ash+borer"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("validates the query and location pair before calling upstream", async () => {
    const response = await GET(request("q=x&lat=42"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
