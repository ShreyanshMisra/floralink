import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createInaturalistAdapter,
  INATURALIST_REVALIDATE_SECONDS,
  INATURALIST_TIMEOUT_MS,
  InaturalistUnavailableError,
} from "./inaturalist";
import {
  ambiguousAshTaxa,
  emeraldAshBorerTaxon,
} from "@/test/fixtures/inaturalist";

const baseUrl = "https://api.inaturalist.test/v1";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe("iNaturalist adapter", () => {
  it("normalizes, deduplicates, caps candidates, and sends the fixed request policy", async () => {
    let receivedUserAgent: string | null = null;
    server.use(
      http.get(`${baseUrl}/taxa/autocomplete`, ({ request }) => {
        receivedUserAgent = request.headers.get("user-agent");
        return HttpResponse.json({
          results: [
            emeraldAshBorerTaxon,
            emeraldAshBorerTaxon,
            ...ambiguousAshTaxa.slice(1),
          ],
        });
      }),
    );
    const interceptedFetch = globalThis.fetch;
    const fetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      interceptedFetch(input, init),
    );
    const adapter = createInaturalistAdapter({
      baseUrl,
      userAgent: "FloraLink-tests/0.1",
      fetchImplementation: fetchSpy as typeof fetch,
    });

    const candidates = await adapter.searchTaxa({
      query: "emerald ash borer",
      latitude: 42.36,
      longitude: -71.06,
      limit: 5,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      inaturalistTaxonId: "70057",
      scientificName: "Agrilus planipennis",
      commonName: "Emerald Ash Borer",
      rank: "species",
      matchScore: null,
      matchedName: "emerald ash borer",
      imageUrl:
        "https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpg",
      sourceUrl: "https://www.inaturalist.org/taxa/70057",
    });
    expect(receivedUserAgent).toBe("FloraLink-tests/0.1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      next: { revalidate: INATURALIST_REVALIDATE_SECONDS },
    });
  });

  it("normalizes an upstream HTTP failure without retrying", async () => {
    let calls = 0;
    server.use(
      http.get(`${baseUrl}/taxa/autocomplete`, () => {
        calls += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );

    await expect(
      createInaturalistAdapter({ baseUrl }).searchTaxa({ query: "ash" }),
    ).rejects.toBeInstanceOf(InaturalistUnavailableError);
    expect(calls).toBe(1);
  });

  it("rejects malformed JSON as unavailable", async () => {
    server.use(
      http.get(
        `${baseUrl}/taxa/autocomplete`,
        () => new HttpResponse("{", { headers: { "Content-Type": "application/json" } }),
      ),
    );

    await expect(
      createInaturalistAdapter({ baseUrl }).searchTaxa({ query: "ash" }),
    ).rejects.toBeInstanceOf(InaturalistUnavailableError);
  });

  it(
    "aborts a timed-out request at exactly five seconds",
    async () => {
      server.use(
        http.get(`${baseUrl}/taxa/autocomplete`, async () => {
          await delay("infinite");
          return HttpResponse.json({ results: [] });
        }),
      );
      const startedAt = Date.now();

      await expect(
        createInaturalistAdapter({ baseUrl }).searchTaxa({ query: "ash" }),
      ).rejects.toBeInstanceOf(InaturalistUnavailableError);

      const elapsed = Date.now() - startedAt;
      expect(elapsed).toBeGreaterThanOrEqual(INATURALIST_TIMEOUT_MS - 100);
      expect(elapsed).toBeLessThan(INATURALIST_TIMEOUT_MS + 1_000);
    },
    7_000,
  );
});
