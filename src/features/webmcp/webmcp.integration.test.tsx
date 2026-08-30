// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/ensure-anonymous-auth", () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" }),
}));

import {
  DraftAnnouncement,
  StagedReportCard,
} from "@/components/reports/staged-report-card";
import { ensureAnonymousAuth } from "@/features/auth/ensure-anonymous-auth";
import { reportDraftStore } from "@/features/reports/report-draft-store";
import { WebMcpProvider } from "@/features/webmcp/webmcp-provider";
import { WebMcpStatusBadge } from "@/features/webmcp/webmcp-status";

function installModelContextMock() {
  const active = new Map<string, WebMcpToolDefinition>();
  const registrations: WebMcpToolDefinition[] = [];
  const registerTool: WebMcpModelContext["registerTool"] = (tool, options) => {
    if (options?.signal?.aborted) return;
    active.set(tool.name, tool);
    registrations.push(tool);
    options?.signal?.addEventListener(
      "abort",
      () => {
        if (active.get(tool.name) === tool) active.delete(tool.name);
      },
      { once: true },
    );
  };
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: { registerTool },
  });
  return { active, registrations };
}

const stageInput = {
  raw_taxon_guess: "Emerald ash borer",
  location: {
    mode: "point",
    latitude: 42.36,
    longitude: -71.06,
    accuracyMeters: null,
    source: "agent_supplied",
  },
  observed_at: "2026-08-31T12:00:00Z",
  host_status: "damaged",
  notes: "Observed D-shaped exit holes",
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(ensureAnonymousAuth).mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
  } as Awaited<ReturnType<typeof ensureAnonymousAuth>>);
  sessionStorage.clear();
  reportDraftStore.setState({
    hydrated: true,
    draft: null,
    reviewOpen: false,
    announcement: "",
    locationEditMode: "idle",
    locationEditAnchor: null,
  });
});

describe("WebMCP staged review integration", () => {
  it("shows a non-blocking unsupported-browser fallback", async () => {
    delete document.modelContext;
    render(
      <WebMcpProvider>
        <WebMcpStatusBadge />
        <button type="button">Report manually</button>
      </WebMcpProvider>,
    );

    expect(await screen.findByText("Agent tools unavailable")).toBeVisible();
    expect(
      screen.getByText(
        "Agent tools unavailable in this browser. Manual reporting still works.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Report manually" })).toBeEnabled();
  });

  it("registers exactly five tools once under Strict Mode and cleans up", async () => {
    const mock = installModelContextMock();
    const view = render(
      <StrictMode>
        <WebMcpProvider><div>content</div></WebMcpProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(mock.active.size).toBe(5));
    expect([...mock.active.keys()]).toEqual([
      "search_taxa",
      "verify_ecological_relevance",
      "get_device_location",
      "stage_sighting_report",
      "get_staged_sighting",
    ]);
    expect([...mock.active.keys()].some((name) => /submit|confirm/.test(name))).toBe(false);
    expect(mock.registrations.length).toBeGreaterThanOrEqual(5);

    view.unmount();
    expect(mock.active.size).toBe(0);
  });

  it("immediately hydrates the card and aria-live region, then exposes human edits", async () => {
    const user = userEvent.setup();
    const mock = installModelContextMock();
    render(
      <WebMcpProvider>
        <DraftAnnouncement />
        <StagedReportCard />
      </WebMcpProvider>,
    );
    await waitFor(() => expect(mock.active.size).toBe(5));
    const stageTool = mock.active.get("stage_sighting_report");
    const getTool = mock.active.get("get_staged_sighting");
    expect(stageTool).toBeDefined();
    expect(getTool).toBeDefined();

    await act(async () => {
      await stageTool?.execute(stageInput, {
        signal: new AbortController().signal,
      });
    });
    expect(screen.getByRole("heading", { name: "Review sighting" })).toBeVisible();
    expect(screen.getByText("Not submitted")).toBeVisible();
    expect(screen.getByText("Sighting staged for review")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Emerald ash borer")).toBeVisible();

    await user.clear(screen.getByLabelText("Notes"));
    await user.type(screen.getByLabelText("Notes"), "Human corrected note");
    const result = (await getTool?.execute(
      {},
      { signal: new AbortController().signal },
    )) as { draft: { notes: string; lastEditedBy: string; revision: number } };
    expect(result.draft).toMatchObject({
      notes: "Human corrected note",
      lastEditedBy: "human",
    });
    expect(result.draft.revision).toBeGreaterThan(1);
    expect(screen.getByText(/Edited by you/)).toBeVisible();
  });

  it("returns structured validation and conflict failures without overwriting", async () => {
    const mock = installModelContextMock();
    render(<WebMcpProvider><StagedReportCard /></WebMcpProvider>);
    await waitFor(() => expect(mock.active.size).toBe(5));
    const stageTool = mock.active.get("stage_sighting_report")!;
    const invalid = await stageTool.execute(
      { raw_taxon_guess: "x" },
      { signal: new AbortController().signal },
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(reportDraftStore.getState().draft).toBeNull();

    const staged = (await stageTool.execute(stageInput, {
      signal: new AbortController().signal,
    })) as { stageId: string };
    reportDraftStore.getState().editFromHuman({ notes: "Keep this" });
    const conflict = await stageTool.execute(
      { ...stageInput, expected_stage_id: staged.stageId, expected_revision: 1 },
      { signal: new AbortController().signal },
    );
    expect(conflict).toMatchObject({
      ok: false,
      error: { code: "DRAFT_CONFLICT", currentStageId: staged.stageId },
    });
    expect(reportDraftStore.getState().draft?.notes).toBe("Keep this");
  });
});
