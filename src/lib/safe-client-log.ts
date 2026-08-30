type ClientErrorEvent = {
  code: "CLIENT_ERROR_BOUNDARY";
  digest: string | null;
  errorName: string;
};

export function logClientErrorBoundary(error: Error & { digest?: string }) {
  const event: ClientErrorEvent = {
    code: "CLIENT_ERROR_BOUNDARY",
    digest: typeof error.digest === "string" ? error.digest : null,
    errorName: error.name || "Error",
  };

  // Deliberately omit message, stack, URL, coordinates, notes, tokens, and media.
  console.error("FloraLink client error", event);
}
