import { ImageResponse } from "next/og";

export const alt =
  "FloraLink: an AI agent drafts a biodiversity sighting and a person confirms it";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const steps = [
  { label: "Agent", detail: "searches taxonomy, checks regional status" },
  { label: "Draft", detail: "staged in the live UI for review" },
  { label: "Human", detail: "adds a photo, confirms the sighting" },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "#f7faf5",
          color: "#173229",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 28,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#1f6a48",
              fontWeight: 700,
            }}
          >
            FloraLink
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.1,
              marginTop: 20,
              maxWidth: 960,
            }}
          >
            AI agents draft the sighting. People confirm it.
          </div>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {steps.map((step) => (
            <div
              key={step.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: "28px 32px",
                background: "#ffffff",
                border: "2px solid #d9e3dc",
                borderRadius: 20,
              }}
            >
              <div style={{ fontSize: 34, fontWeight: 700, color: "#1f6a48" }}>
                {step.label}
              </div>
              <div style={{ fontSize: 24, marginTop: 8, color: "#5d6f67" }}>
                {step.detail}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 24, color: "#5d6f67" }}>
          WebMCP · Next.js · Supabase/PostGIS · iNaturalist
        </div>
      </div>
    ),
    size,
  );
}
