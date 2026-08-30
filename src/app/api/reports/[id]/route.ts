import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceSupabaseClient } from "@/lib/supabase-service";

const idSchema = z.string().uuid();

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const parsedId = idSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_REPORT_ID", message: "Provide a valid report ID.", retryable: false }, requestId },
      { status: 400 },
    );
  }

  const sessionClient = await createServerSupabaseClient();
  const { data: authData } = await sessionClient.auth.getUser();
  const service = createServiceSupabaseClient();
  const { data: report, error } = await service
    .from("reports")
    .select("id, reporter_id, status, raw_taxon_guess, scientific_name, common_name, taxon_rank, inaturalist_taxon_id, identification_confidence, observed_at, location_mode, location, location_bbox, location_source, accuracy_meters, rough_location_text, host_status, notes, agent_evidence_summary, ecological_status, sensitivity_level, urgency, verification_id, human_confirmed_at, created_at")
    .eq("id", parsedId.data)
    .maybeSingle();
  const isOwner = Boolean(report && authData.user?.id === report.reporter_id);
  if (error || !report || (!isOwner && report.sensitivity_level === "private")) {
    return NextResponse.json(
      { ok: false, error: { code: "REPORT_NOT_FOUND", message: "The report is unavailable.", retryable: false }, requestId },
      { status: 404 },
    );
  }

  const { data: media } = await service
    .from("report_media")
    .select("storage_path, mime_type, width, height")
    .eq("report_id", report.id)
    .maybeSingle();
  let mediaUrl: string | null = null;
  if (media) {
    const { data: signed } = await service.storage
      .from("sighting-media")
      .createSignedUrl(media.storage_path, 300);
    mediaUrl = signed?.signedUrl ?? null;
  }

  const { data: geoJson } = await service.rpc("report_location_geojson", {
    report_uuid: report.id,
  });
  const geometry = geoJson as
    | { type: "Point"; coordinates: [number, number] }
    | { type: "Polygon"; coordinates: [number, number][][] }
    | null;
  const exactLocation = geometry?.type === "Point"
    ? { mode: "point" as const, latitude: geometry.coordinates[1], longitude: geometry.coordinates[0] }
    : geometry?.type === "Polygon"
      ? (() => {
          const coordinates = geometry.coordinates.flat();
          const longitudes = coordinates.map(([longitude]) => longitude);
          const latitudes = coordinates.map(([, latitude]) => latitude);
          return {
            mode: "bounding_box" as const,
            south: Math.min(...latitudes),
            west: Math.min(...longitudes),
            north: Math.max(...latitudes),
            east: Math.max(...longitudes),
          };
        })()
      : null;

  const base = {
    id: report.id,
    displayTaxonName: report.common_name ?? report.scientific_name ?? report.raw_taxon_guess,
    ecologicalStatus: report.ecological_status,
    urgency: report.urgency,
    observedAt: report.observed_at,
    locationPrecisionLabel: report.location_mode === "point" ? "rounded point" : "approximate area",
    media: media ? { url: mediaUrl, mimeType: media.mime_type, width: media.width, height: media.height, expiresInSeconds: 300 } : null,
    createdAt: report.created_at,
  };

  if (isOwner) {
    return NextResponse.json({
      ok: true,
      data: {
        ...base,
        ownerView: true,
        location: exactLocation,
        rawTaxonGuess: report.raw_taxon_guess,
        scientificName: report.scientific_name,
        commonName: report.common_name,
        taxonRank: report.taxon_rank,
        inaturalistTaxonId: report.inaturalist_taxon_id,
        identificationConfidence: report.identification_confidence,
        locationSource: report.location_source,
        accuracyMeters: report.accuracy_meters,
        roughLocationText: report.rough_location_text,
        hostStatus: report.host_status,
        notes: report.notes,
        agentEvidenceSummary: report.agent_evidence_summary,
        verificationId: report.verification_id,
        humanConfirmedAt: report.human_confirmed_at,
      },
      requestId,
    });
  }

  const location = exactLocation?.mode === "point"
    ? { ...exactLocation, latitude: Number(exactLocation.latitude.toFixed(2)), longitude: Number(exactLocation.longitude.toFixed(2)) }
    : exactLocation?.mode === "bounding_box"
      ? {
          ...exactLocation,
          south: Number(exactLocation.south.toFixed(2)),
          west: Number(exactLocation.west.toFixed(2)),
          north: Number(exactLocation.north.toFixed(2)),
          east: Number(exactLocation.east.toFixed(2)),
        }
      : null;
  return NextResponse.json({ ok: true, data: { ...base, ownerView: false, location }, requestId });
}
