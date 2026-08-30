import "server-only";

import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import type {
  RegionalTaxonStatus,
  VerificationRepository,
} from "@/features/verification/verification";
import { INATURALIST_ADAPTER_VERSION } from "@/features/taxonomy/inaturalist";
import { createServiceSupabaseClient } from "@/lib/supabase-service";

interface RegionalStatusRow {
  jurisdiction: string;
  scientific_name: string;
  inaturalist_taxon_id: string | null;
  status: RegionalTaxonStatus["status"];
  sensitivity_level: RegionalTaxonStatus["sensitivityLevel"];
  authority_name: string;
  authority_url: string;
  authority_record_id: string | null;
  last_checked_at: string;
  notes: string;
}

function mapRegionalStatus(row: RegionalStatusRow): RegionalTaxonStatus {
  return {
    jurisdiction: row.jurisdiction,
    scientificName: row.scientific_name,
    inaturalistTaxonId: row.inaturalist_taxon_id,
    status: row.status,
    sensitivityLevel: row.sensitivity_level,
    authorityName: row.authority_name,
    authorityUrl: row.authority_url,
    authorityRecordId: row.authority_record_id,
    lastCheckedAt: row.last_checked_at,
    notes: row.notes,
  };
}

function dataOrThrow(
  response: PostgrestSingleResponse<RegionalStatusRow | null>,
) {
  if (response.error) {
    throw new Error("Regional taxon status lookup failed.");
  }
  return response.data ? mapRegionalStatus(response.data) : null;
}

export function createSupabaseVerificationRepository(): VerificationRepository {
  const supabase = createServiceSupabaseClient();
  const selectedColumns =
    "jurisdiction, scientific_name, inaturalist_taxon_id, status, sensitivity_level, authority_name, authority_url, authority_record_id, last_checked_at, notes";

  return {
    async findRegionalStatus({
      jurisdiction,
      inaturalistTaxonId,
      scientificName,
    }) {
      if (inaturalistTaxonId) {
        const byId = await supabase
          .from("regional_taxon_status")
          .select(selectedColumns)
          .eq("jurisdiction", jurisdiction)
          .eq("inaturalist_taxon_id", inaturalistTaxonId)
          .order("authority_name")
          .limit(1)
          .maybeSingle<RegionalStatusRow>();
        const status = dataOrThrow(byId);
        if (status) {
          return status;
        }
      }

      if (!scientificName) {
        return null;
      }

      return dataOrThrow(
        await supabase
          .from("regional_taxon_status")
          .select(selectedColumns)
          .eq("jurisdiction", jurisdiction)
          .eq("scientific_name", scientificName)
          .order("authority_name")
          .limit(1)
          .maybeSingle<RegionalStatusRow>(),
      );
    },

    async persistVerification(input) {
      const { data, error } = await supabase
        .from("verification_runs")
        .insert({
          requested_guess: input.requestedGuess,
          jurisdiction: input.jurisdiction,
          candidate_inaturalist_taxon_id: input.taxon.inaturalistTaxonId,
          candidate_scientific_name: input.taxon.scientificName,
          candidate_common_name: input.taxon.commonName,
          candidate_rank: input.taxon.rank,
          match_score: input.taxon.matchScore,
          matched_name: input.taxon.matchedName,
          candidate_source_url: input.taxon.sourceUrl,
          state: "verified",
          ecological_status: input.ecologicalStatus,
          sensitivity_level: input.sensitivityLevel,
          urgency: input.urgency,
          nearby_observation_count: input.nearbyObservationCount,
          nearby_radius_km: input.nearbyRadiusKm,
          warnings: input.warnings,
          sources: input.sources,
          adapter_versions: { inaturalist: INATURALIST_ADAPTER_VERSION },
          retrieved_at: input.retrievedAt,
        })
        .select("id")
        .single<{ id: string }>();

      if (error || !data) {
        throw new Error("Verification persistence failed.");
      }

      return data.id;
    },
  };
}
