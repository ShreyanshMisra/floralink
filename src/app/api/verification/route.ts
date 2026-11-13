import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  checkRateLimit,
  clientKeyFromRequest,
  rateLimitedResponse,
  rateLimitPolicies,
} from "@/lib/rate-limit";
import {
  createInaturalistAdapter,
  InaturalistUnavailableError,
} from "@/features/taxonomy/inaturalist";
import { verificationRequestSchema } from "@/features/verification/contracts";
import { createSupabaseVerificationRepository } from "@/features/verification/supabase-verification-repository";
import {
  TaxonAmbiguousError,
  TaxonNotFoundError,
  verifyTaxon,
} from "@/features/verification/verification";

export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  const rateLimit = checkRateLimit(
    rateLimitPolicies.verification,
    clientKeyFromRequest(request),
  );
  if (!rateLimit.allowed) return rateLimitedResponse(requestId, rateLimit);

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a valid JSON verification request.",
          retryable: false,
        },
        requestId,
      },
      { status: 400 },
    );
  }

  const parsedRequest = verificationRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "The verification request is invalid.",
          retryable: false,
          fieldErrors: parsedRequest.error.flatten().fieldErrors,
        },
        requestId,
      },
      { status: 400 },
    );
  }

  try {
    const verification = await verifyTaxon(parsedRequest.data, {
      inaturalist: createInaturalistAdapter(),
      repository: createSupabaseVerificationRepository(),
    });

    return NextResponse.json({ ok: true, data: verification, requestId });
  } catch (error) {
    if (error instanceof TaxonNotFoundError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "TAXON_NOT_FOUND",
            message: "No usable iNaturalist taxon matched the request.",
            retryable: false,
          },
          requestId,
        },
        { status: 404 },
      );
    }

    if (error instanceof TaxonAmbiguousError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "TAXON_AMBIGUOUS",
            message: "Multiple taxa matched. Select a candidate before verifying.",
            retryable: false,
          },
          requestId,
        },
        { status: 409 },
      );
    }

    if (error instanceof InaturalistUnavailableError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: "iNaturalist is temporarily unavailable. Keep the sighting unverified or retry later.",
            retryable: true,
          },
          requestId,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VERIFICATION_UNAVAILABLE",
          message: "Verification could not be completed. Retry later or keep the sighting unverified.",
          retryable: true,
        },
        requestId,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
