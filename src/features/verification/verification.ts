import {
  normalizeTaxonComparisonKey,
  type TaxonCandidate,
} from "@/features/taxonomy/contracts";
import {
  INATURALIST_ADAPTER_VERSION,
  type InaturalistAdapter,
  type OccurrenceContext,
} from "@/features/taxonomy/inaturalist";
import type {
  EcologicalStatus,
  EcologicalVerification,
  SensitivityLevel,
  Urgency,
  VerificationRequest,
} from "@/features/verification/contracts";

export interface RegionalTaxonStatus {
  jurisdiction: string;
  scientificName: string;
  inaturalistTaxonId: string | null;
  status: EcologicalStatus;
  sensitivityLevel: SensitivityLevel;
  authorityName: string;
  authorityUrl: string;
  authorityRecordId: string | null;
  lastCheckedAt: string;
  notes: string;
}

interface PersistedVerification {
  requestedGuess: string;
  jurisdiction: string;
  taxon: TaxonCandidate;
  ecologicalStatus: EcologicalStatus;
  sensitivityLevel: SensitivityLevel;
  urgency: Urgency;
  nearbyObservationCount: number | null;
  nearbyRadiusKm: number | null;
  warnings: string[];
  sources: EcologicalVerification["sources"];
  retrievedAt: string;
}

export interface VerificationRepository {
  findRegionalStatus(input: {
    jurisdiction: string;
    inaturalistTaxonId?: string;
    scientificName?: string;
  }): Promise<RegionalTaxonStatus | null>;
  persistVerification(input: PersistedVerification): Promise<string>;
}

export class TaxonNotFoundError extends Error {
  constructor() {
    super("No usable iNaturalist taxon matched the request.");
    this.name = "TaxonNotFoundError";
  }
}

export class TaxonAmbiguousError extends Error {
  constructor() {
    super("The taxon guess matched multiple candidates.");
    this.name = "TaxonAmbiguousError";
  }
}

export function urgencyForStatus(status: EcologicalStatus): Urgency {
  switch (status) {
    case "regulated_invasive":
    case "invasive":
      return "priority";
    case "protected":
    case "introduced":
      return "review";
    case "native":
    case "common":
      return "routine";
    case "unknown":
      return "unknown";
  }
}

function statusWarning(status: EcologicalStatus, authorityName?: string) {
  switch (status) {
    case "regulated_invasive":
      return `A regional authority (${authorityName}) classifies this taxon as regulated invasive.`;
    case "invasive":
      return `A regional authority (${authorityName}) classifies this taxon as invasive.`;
    case "protected":
      return "This taxon is protected regionally; location privacy and manual review apply.";
    case "introduced":
      return "This taxon is introduced regionally; introduced does not automatically mean invasive.";
    case "unknown":
      return "Regional ecological status is not established in FloraLink's authority records.";
    case "native":
    case "common":
      return null;
  }
}

function chooseRawGuessCandidate(
  requestedGuess: string,
  candidates: TaxonCandidate[],
) {
  if (candidates.length === 0) {
    throw new TaxonNotFoundError();
  }

  const requestedKey = normalizeTaxonComparisonKey(requestedGuess);
  const exactCandidates = candidates.filter(
    (candidate) =>
      normalizeTaxonComparisonKey(candidate.scientificName) === requestedKey,
  );

  if (exactCandidates.length === 1) {
    return exactCandidates[0];
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  throw new TaxonAmbiguousError();
}

function occurrenceWarnings(occurrence: OccurrenceContext | null) {
  if (!occurrence) {
    return ["Nearby occurrence context was not requested because no location was provided."];
  }

  return [
    occurrence.count > 0
      ? `${occurrence.count} iNaturalist observation record(s) were reported in the queried area.`
      : "No iNaturalist observations were found in the queried records.",
    "Occurrence records are context only and do not establish presence, absence, or ecological status.",
  ];
}

export async function verifyTaxon(
  request: VerificationRequest,
  dependencies: {
    inaturalist: InaturalistAdapter;
    repository: VerificationRepository;
  },
): Promise<EcologicalVerification> {
  const requestedGuess = request.scientificName ?? request.rawTaxonGuess!;

  // The authoritative database lookup deliberately occurs before any
  // iNaturalist request. A second exact lookup follows canonical resolution
  // only when the initial user-supplied identity did not match a record.
  let regionalStatus = await dependencies.repository.findRegionalStatus({
    jurisdiction: request.jurisdiction,
    inaturalistTaxonId: request.inaturalistTaxonId,
    scientificName: request.inaturalistTaxonId ? undefined : requestedGuess,
  });

  let taxon: TaxonCandidate;
  if (request.inaturalistTaxonId) {
    const exactTaxon = await dependencies.inaturalist.getTaxon(
      request.inaturalistTaxonId,
    );
    if (!exactTaxon) {
      throw new TaxonNotFoundError();
    }
    taxon = exactTaxon;
  } else {
    const candidates = await dependencies.inaturalist.searchTaxa({
      query: request.rawTaxonGuess!,
      limit: 5,
    });
    taxon = chooseRawGuessCandidate(request.rawTaxonGuess!, candidates);
  }

  if (!regionalStatus) {
    regionalStatus = await dependencies.repository.findRegionalStatus({
      jurisdiction: request.jurisdiction,
      inaturalistTaxonId: taxon.inaturalistTaxonId,
      scientificName: taxon.scientificName,
    });
  }

  const occurrence = request.location
    ? await dependencies.inaturalist.getOccurrenceContext(
        taxon.inaturalistTaxonId,
        request.location,
      )
    : null;
  const retrievedAt = new Date().toISOString();
  const ecologicalStatus = regionalStatus?.status ?? "unknown";
  const sensitivityLevel =
    regionalStatus?.sensitivityLevel ?? "rounded_public";
  const urgency = urgencyForStatus(ecologicalStatus);
  const warnings = occurrenceWarnings(occurrence);
  const ecologicalWarning = statusWarning(
    ecologicalStatus,
    regionalStatus?.authorityName,
  );

  if (ecologicalWarning) {
    warnings.unshift(ecologicalWarning);
  }
  if (request.hostStatus === "damaged" || request.hostStatus === "dead") {
    warnings.push("Host impact was observed; this does not change the taxon's regional status.");
  }
  if (
    request.identificationConfidence !== null &&
    request.identificationConfidence !== undefined &&
    request.identificationConfidence < 0.5
  ) {
    warnings.push("Identification confidence is low; manual taxon review is recommended.");
  }

  const sources: EcologicalVerification["sources"] = [
    {
      name: "iNaturalist taxonomy",
      url: taxon.sourceUrl,
      kind: "taxonomy",
      retrievedAt,
    },
  ];

  if (occurrence) {
    sources.push({
      name: "iNaturalist observations",
      url: occurrence.sourceUrl,
      kind: "occurrence",
      retrievedAt: occurrence.retrievedAt,
    });
  }

  if (regionalStatus) {
    sources.push({
      name: regionalStatus.authorityName,
      url: regionalStatus.authorityUrl,
      kind: "regional_status",
      retrievedAt: new Date(regionalStatus.lastCheckedAt).toISOString(),
    });
  }

  const verificationId = await dependencies.repository.persistVerification({
    requestedGuess,
    jurisdiction: request.jurisdiction,
    taxon,
    ecologicalStatus,
    sensitivityLevel,
    urgency,
    nearbyObservationCount: occurrence?.count ?? null,
    nearbyRadiusKm: occurrence?.radiusKm ?? null,
    warnings,
    sources,
    retrievedAt,
  });

  return {
    verificationId,
    state: "verified",
    taxon,
    jurisdiction: request.jurisdiction,
    ecologicalStatus,
    sensitivityLevel,
    urgency,
    nearbyObservationCount: occurrence?.count ?? null,
    nearbyRadiusKm: occurrence?.radiusKm ?? null,
    warnings,
    sources,
  };
}

export { INATURALIST_ADAPTER_VERSION };
