import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  checkRateLimit,
  clientKeyFromRequest,
  rateLimitedResponse,
  rateLimitPolicies,
} from "@/lib/rate-limit";
import {
  sanitizeViewportRows,
  viewportBoundsSchema,
} from "@/features/reports/public-reports";
import {
  reportSubmissionSchema,
  submissionReceiptSchema,
} from "@/features/reports/submission-contracts";
import { createServerSupabaseClient } from "@/lib/supabase-server";

function failure(
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryable = false,
  fieldErrors?: Record<string, string[] | undefined>,
) {
  return NextResponse.json(
    { ok: false, error: { code, message, retryable, fieldErrors }, requestId },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  const rateLimit = checkRateLimit(
    rateLimitPolicies.submitReport,
    clientKeyFromRequest(request),
  );
  if (!rateLimit.allowed) return rateLimitedResponse(requestId, rateLimit);

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return failure(requestId, 400, "INVALID_IDEMPOTENCY_KEY", "Provide a valid Idempotency-Key header.");
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return failure(requestId, 401, "AUTH_REQUIRED", "Start a contribution session before submitting.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(requestId, 400, "VALIDATION_ERROR", "Provide a valid JSON report.");
  }
  const parsed = reportSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return failure(
      requestId,
      400,
      "VALIDATION_ERROR",
      "The reviewed sighting is not ready to submit.",
      false,
      parsed.error.flatten().fieldErrors,
    );
  }

  const expectedPrefix = `${authData.user.id}/${parsed.data.stageId}/`;
  if (parsed.data.media && !parsed.data.media.storagePath.startsWith(expectedPrefix)) {
    return failure(requestId, 403, "MEDIA_OWNER_MISMATCH", "The staged media does not belong to this contribution session.");
  }

  const { media, humanAcknowledged: _humanAcknowledged, acknowledgedApproximateLocation: _acknowledged, ...submission } = parsed.data;
  void _humanAcknowledged;
  void _acknowledged;
  const { data, error } = await supabase.rpc("submit_sighting_report", {
    submission,
    media,
    idempotency_key: idempotencyKey,
  });
  if (error) {
    const ownershipFailure = error.code === "42501";
    return failure(
      requestId,
      ownershipFailure ? 403 : 400,
      ownershipFailure ? "MEDIA_OWNER_MISMATCH" : "SUBMISSION_REJECTED",
      ownershipFailure
        ? "The staged media does not belong to this contribution session."
        : "The sighting could not be persisted from the reviewed data.",
    );
  }

  const receipt = submissionReceiptSchema.safeParse(data);
  if (!receipt.success) {
    return failure(requestId, 503, "INVALID_RECEIPT", "The submission receipt could not be verified.", true);
  }
  return NextResponse.json(
    { ok: true, data: receipt.data, requestId },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const searchParams = request.nextUrl.searchParams;
  const parsedBounds = viewportBoundsSchema.safeParse({
    south: searchParams.get("south"),
    west: searchParams.get("west"),
    north: searchParams.get("north"),
    east: searchParams.get("east"),
  });

  if (!parsedBounds.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_VIEWPORT",
          message: "Provide a valid Massachusetts-sized viewport.",
          retryable: false,
          fieldErrors: parsedBounds.error.flatten().fieldErrors,
        },
        requestId,
      },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("reports_in_view", parsedBounds.data);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "REPORTS_UNAVAILABLE",
          message: "Public reports are temporarily unavailable.",
          retryable: true,
        },
        requestId,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const reports = sanitizeViewportRows(data ?? []);
    return NextResponse.json(
      { ok: true, data: reports, requestId },
      {
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_REPORT_DATA",
          message: "Public reports could not be safely displayed.",
          retryable: true,
        },
        requestId,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
