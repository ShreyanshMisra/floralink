import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  sanitizeViewportRows,
  viewportBoundsSchema,
} from "@/features/reports/public-reports";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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
