import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { taxonSearchQuerySchema } from "@/features/taxonomy/contracts";
import {
  createInaturalistAdapter,
  InaturalistUnavailableError,
} from "@/features/taxonomy/inaturalist";

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const searchParams = request.nextUrl.searchParams;
  const parsedQuery = taxonSearchQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    lat: searchParams.get("lat") ?? undefined,
    lng: searchParams.get("lng") ?? undefined,
    locale: searchParams.get("locale") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide a taxon query between 2 and 120 characters.",
          retryable: false,
          fieldErrors: parsedQuery.error.flatten().fieldErrors,
        },
        requestId,
      },
      { status: 400 },
    );
  }

  try {
    const candidates = await createInaturalistAdapter().searchTaxa({
      query: parsedQuery.data.q,
      latitude: parsedQuery.data.lat,
      longitude: parsedQuery.data.lng,
      locale: parsedQuery.data.locale,
      limit: parsedQuery.data.limit,
    });

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "TAXON_NOT_FOUND",
            message: "No usable iNaturalist taxon matched that query.",
            retryable: false,
          },
          requestId,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: candidates, requestId });
  } catch (error) {
    if (error instanceof InaturalistUnavailableError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: "iNaturalist is temporarily unavailable. Retry later or keep the taxon unverified.",
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
          code: "UPSTREAM_UNAVAILABLE",
          message: "Taxon search is temporarily unavailable.",
          retryable: true,
        },
        requestId,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
