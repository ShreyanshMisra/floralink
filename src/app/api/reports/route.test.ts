import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const receipt = {
  receiptId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  reportId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  submittedAt: "2026-08-29T12:00:00.000Z",
  publicReport: {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    displayTaxonName: "Emerald ash borer",
    ecologicalStatus: "unknown",
    urgency: "unknown",
    location: { mode: "point", latitude: 42.36, longitude: -71.06 },
    locationPrecisionLabel: "rounded point",
    observedAt: new Date(Date.now() - 60_000).toISOString(),
    hasThumbnail: false,
    createdAt: "2026-08-29T12:00:00.000Z",
  },
};

let persisted: typeof receipt | null;
const rpc = vi.fn(async (..._args: unknown[]) => {
  void _args;
  persisted ??= receipt;
  return { data: persisted, error: null };
});

vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    rpc,
  }),
}));

import { POST } from "@/app/api/reports/route";
import { resetRateLimits } from "@/lib/rate-limit";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    stageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    revision: 1,
    rawTaxonGuess: "Emerald ash borer",
    taxon: null,
    identificationConfidence: null,
    location: { mode: "point", latitude: 42.36, longitude: -71.06, accuracyMeters: null, source: "manual_pin" },
    observedAt: "2026-08-29T11:00:00.000Z",
    hostStatus: "unknown",
    notes: "",
    agentEvidenceSummary: null,
    verificationId: null,
    acknowledgedApproximateLocation: false,
    humanAcknowledged: true,
    media: null,
    ...overrides,
  };
}

function request(body: unknown, key = "stage-revision-1") {
  return new NextRequest("http://localhost/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reports", () => {
  beforeEach(() => {
    persisted = null;
    rpc.mockClear();
    resetRateLimits();
  });

  it("returns 429 with Retry-After once a client exceeds the submission limit", async () => {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await POST(request(validBody(), `stage-revision-${attempt}`));
    }
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(rpc).toHaveBeenCalledTimes(10);
  });

  it("persists a valid human-reviewed report and returns its receipt", async () => {
    const response = await POST(request(validBody()));
    expect(response.status).toBe(201);
    expect((await response.json()).data).toEqual(receipt);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("reuses the original receipt for a duplicate idempotency key", async () => {
    const first = await POST(request(validBody(), "same-stage-revision"));
    const second = await POST(request(validBody(), "same-stage-revision"));
    expect((await first.json()).data.receiptId).toBe((await second.json()).data.receiptId);
    expect(persisted?.reportId).toBe(receipt.reportId);
  });

  it("rejects an unresolved location before the RPC boundary", async () => {
    const response = await POST(request(validBody({
      location: { mode: "unresolved", roughDescription: "near trail", reason: "missing_reference" },
    })));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects media outside the authenticated user's stage path", async () => {
    const response = await POST(request(validBody({
      media: {
        storagePath: "22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        width: 10,
        height: 10,
      },
    })));
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows a human-reviewed unverified submission and leaves authority to the RPC", async () => {
    const { verificationId: _verificationId, ...bodyWithoutVerification } =
      validBody();
    void _verificationId;
    const response = await POST(request(bodyWithoutVerification));
    expect(response.status).toBe(201);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ submission: { verificationId: null } });
  });
});
