const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5_000);

try {
  const response = await fetch(
    "https://api.inaturalist.org/v1/taxa/70057",
    {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "FloraLink/0.1.0 (+https://floralinkmcp.vercel.app; manual smoke request)",
      },
      signal: controller.signal,
    },
  );

  if (!response.ok) {
    throw new Error(`iNaturalist smoke request returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const taxon = payload?.results?.[0];

  if (String(taxon?.id) !== "70057" || taxon?.name !== "Agrilus planipennis") {
    throw new Error("iNaturalist smoke response did not contain the expected taxon.");
  }

  console.log(
    `iNaturalist smoke request passed: ${taxon.name} (taxon ${taxon.id}).`,
  );
} finally {
  clearTimeout(timeout);
}
