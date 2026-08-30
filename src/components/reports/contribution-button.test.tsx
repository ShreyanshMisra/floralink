// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAnonymousAuth } = vi.hoisted(() => ({
  ensureAnonymousAuth: vi.fn(),
}));

vi.mock("@/features/auth/ensure-anonymous-auth", () => ({
  ensureAnonymousAuth,
}));

import { ContributionButton } from "@/components/reports/contribution-button";
import { reportDraftStore } from "@/features/reports/report-draft-store";

beforeEach(() => {
  sessionStorage.clear();
  ensureAnonymousAuth.mockReset();
  ensureAnonymousAuth.mockResolvedValue(undefined);
  reportDraftStore.setState({
    hydrated: true,
    draft: null,
    reviewOpen: false,
    announcement: "",
    locationEditMode: "idle",
    locationEditAnchor: null,
  });
});

describe("ContributionButton", () => {
  it("starts a clean manual draft and follows the review-sheet state", async () => {
    render(<ContributionButton />);

    fireEvent.click(screen.getByRole("button", { name: "Report Manually" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Draft Open" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(reportDraftStore.getState().draft?.rawTaxonGuess).toBe("");
    expect(reportDraftStore.getState().reviewOpen).toBe(true);

    act(() => reportDraftStore.getState().closeReview());
    expect(
      (screen.getByRole("button", { name: "Open Draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Open Draft" }));
    expect(
      (screen.getByRole("button", { name: "Draft Open" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(reportDraftStore.getState().reviewOpen).toBe(true);

    act(() => reportDraftStore.getState().discardDraft());
    expect(
      (
        screen.getByRole("button", {
          name: "Report Manually",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
