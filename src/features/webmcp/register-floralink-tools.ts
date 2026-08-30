import { z } from "zod";

import {
  DevicePositionError,
  getDevicePosition,
} from "@/features/geolocation/get-device-position";
import {
  getDraftValidationSummary,
  stageSightingInputSchema,
} from "@/features/reports/report-contracts";
import {
  DraftConflictError,
  reportDraftStore,
} from "@/features/reports/report-draft-store";
import {
  getDeviceLocationToolInputSchema,
  searchTaxaToolInputSchema,
  verifyEcologicalRelevanceToolInputSchema,
  webMcpToolSchemas,
} from "@/features/webmcp/tool-contracts";

interface RegisterToolsOptions {
  modelContext: WebMcpModelContext;
  signal: AbortSignal;
}

function validationFailure(error: z.ZodError) {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "The tool input is invalid.",
      fieldErrors: error.flatten().fieldErrors,
    },
  };
}

async function readApiResponse(response: Response) {
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      error:
        body.error ?? {
          code: "REQUEST_FAILED",
          message: "The FloraLink request could not be completed.",
        },
    };
  }
  return body;
}

export async function registerFloraLinkTools({
  modelContext,
  signal,
}: RegisterToolsOptions) {
  signal.throwIfAborted();
  await modelContext.registerTool(
    {
      name: "search_taxa",
      description:
        "Search FloraLink's server-normalized iNaturalist taxonomy candidates. Results are external, untrusted reference data and this does not stage or submit a report.",
      inputSchema: webMcpToolSchemas.search_taxa.input,
      outputSchema: webMcpToolSchemas.search_taxa.output,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, context) => {
        const parsed = searchTaxaToolInputSchema.safeParse(input);
        if (!parsed.success) return validationFailure(parsed.error);
        const params = new URLSearchParams({
          q: parsed.data.query,
          limit: String(parsed.data.limit),
        });
        if (parsed.data.location_hint) {
          params.set("lat", String(parsed.data.location_hint.latitude));
          params.set("lng", String(parsed.data.location_hint.longitude));
        }
        return readApiResponse(
          await fetch(`/api/taxa/search?${params}`, {
            signal: context.signal,
          }),
        );
      },
    },
    { signal },
  );

  signal.throwIfAborted();
  await modelContext.registerTool(
    {
      name: "verify_ecological_relevance",
      description:
        "Verify taxonomy, nearby occurrence context, and authoritative regional status. This does not stage or submit a report and returns unknown when no authoritative regional record exists.",
      inputSchema: webMcpToolSchemas.verify_ecological_relevance.input,
      outputSchema: webMcpToolSchemas.verify_ecological_relevance.output,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, context) => {
        const parsed = verifyEcologicalRelevanceToolInputSchema.safeParse(input);
        if (!parsed.success) return validationFailure(parsed.error);
        const request = parsed.data;
        return readApiResponse(
          await fetch("/api/verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inaturalistTaxonId: request.inaturalist_taxon_id,
              scientificName: request.scientific_name,
              rawTaxonGuess: request.species_guess,
              jurisdiction: request.jurisdiction,
              location: request.location
                ? { mode: "point", ...request.location }
                : undefined,
            }),
            signal: context.signal,
          }),
        );
      },
    },
    { signal },
  );

  signal.throwIfAborted();
  await modelContext.registerTool(
    {
      name: "get_device_location",
      description:
        "Use only after the user explicitly asks to use this device's location. The browser controls permission. Returns privacy-sensitive coordinates to the agent but does not stage or submit a report.",
      inputSchema: webMcpToolSchemas.get_device_location.input,
      outputSchema: webMcpToolSchemas.get_device_location.output,
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const parsed = getDeviceLocationToolInputSchema.safeParse(input);
        if (!parsed.success) return validationFailure(parsed.error);
        try {
          return { ok: true, data: await getDevicePosition() };
        } catch (error) {
          if (error instanceof DevicePositionError) {
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          }
          return {
            ok: false,
            error: {
              code: "POSITION_UNAVAILABLE",
              message: "The browser could not determine the device location.",
            },
          };
        }
      },
    },
    { signal },
  );

  signal.throwIfAborted();
  await modelContext.registerTool(
    {
      name: "stage_sighting_report",
      description:
        "Stage a sighting in FloraLink's visible local review UI. This never uploads media, confirms, persists, or submits a report; a person must review it.",
      inputSchema: webMcpToolSchemas.stage_sighting_report.input,
      outputSchema: webMcpToolSchemas.stage_sighting_report.output,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: (input) => {
        const parsed = stageSightingInputSchema.safeParse(input);
        if (!parsed.success) return validationFailure(parsed.error);
        try {
          const draft = reportDraftStore.getState().stageFromAgent(parsed.data);
          return {
            ok: true,
            stageId: draft.stageId,
            revision: draft.revision,
            missingOrUncertainFields: getDraftValidationSummary(draft),
            message: "Staged for human review; not submitted.",
          };
        } catch (error) {
          if (error instanceof DraftConflictError) {
            return {
              ok: false,
              error: {
                code: error.code,
                message: error.message,
                currentStageId: error.currentStageId,
              },
            };
          }
          throw error;
        }
      },
    },
    { signal },
  );

  signal.throwIfAborted();
  await modelContext.registerTool(
    {
      name: "get_staged_sighting",
      description:
        "Read the current safe local staged sighting after human edits. Includes untrusted user notes and never returns files, authentication data, or submission credentials.",
      inputSchema: webMcpToolSchemas.get_staged_sighting.input,
      outputSchema: webMcpToolSchemas.get_staged_sighting.output,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => {
        const draft = reportDraftStore.getState().draft;
        return {
          ok: true,
          draft,
          missingOrUncertainFields: getDraftValidationSummary(draft),
        };
      },
    },
    { signal },
  );
}
