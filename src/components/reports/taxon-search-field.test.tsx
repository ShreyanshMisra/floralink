// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TAXON_SEARCH_DEBOUNCE_MS,
  TaxonSearchField,
} from "@/components/reports/taxon-search-field";
import type { TaxonCandidate } from "@/features/taxonomy/contracts";

const candidate: TaxonCandidate = {
  inaturalistTaxonId: "47851",
  scientificName: "Quercus rubra",
  commonName: "Northern Red Oak",
  rank: "species",
  matchScore: 1,
  matchedName: "Northern Red Oak",
  imageUrl: null,
  sourceUrl: "https://www.inaturalist.org/taxa/47851",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TaxonSearchField", () => {
  it("waits exactly 400 ms after the last input before searching", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: [candidate] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    function Harness() {
      const [value, setValue] = useState("");
      return (
        <TaxonSearchField
          value={value}
          location={{
            mode: "unresolved",
            roughDescription: "Not provided",
            reason: "insufficient_detail",
          }}
          onChange={setValue}
          onSelect={() => undefined}
        />
      );
    }

    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "oak" } });

    act(() => vi.advanceTimersByTime(TAXON_SEARCH_DEBOUNCE_MS - 1));
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("option").textContent).toContain("Northern Red Oak");
  });
});
