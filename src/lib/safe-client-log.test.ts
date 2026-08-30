import { afterEach, describe, expect, it, vi } from "vitest";

import { logClientErrorBoundary } from "@/lib/safe-client-log";

afterEach(() => vi.restoreAllMocks());

describe("logClientErrorBoundary", () => {
  it("logs only allowlisted error metadata", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("notes=secret coordinate=42.12345"), {
      digest: "safe-digest",
    });

    logClientErrorBoundary(error);

    expect(consoleSpy).toHaveBeenCalledWith("FloraLink client error", {
      code: "CLIENT_ERROR_BOUNDARY",
      digest: "safe-digest",
      errorName: "Error",
    });
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("42.12345");
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain("notes=secret");
  });
});
