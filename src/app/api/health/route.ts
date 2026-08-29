import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const requestId = randomUUID();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("regional_taxon_status")
    .select("id")
    .limit(1);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database readiness check failed.",
          retryable: true,
        },
        requestId,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        version: "0.1.0",
        buildCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        readiness: { application: true, database: true },
      },
      requestId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
