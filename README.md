# FloraLink

**License: [MIT](LICENSE)**

FloraLink is a WebMCP-powered biodiversity reporting app. A browsing agent turns a field observation into structured ecological data and stages it directly in the live interface. The person reviews the draft, adds evidence, and submits the report.

The Massachusetts-focused MVP combines iNaturalist taxonomy lookup, sourced regional context, a Leaflet map, and private photo handling. It preserves uncertainty instead of inventing a species or precise location.

## WebMCP implementation

The five direct `document.modelContext.registerTool(...)` bindings are in [`src/features/webmcp/register-floralink-tools.ts`](https://github.com/ShreyanshMisra/floralink/blob/main/src/features/webmcp/register-floralink-tools.ts).

The tools can search taxonomy, verify ecological relevance, request device location with permission, stage a sighting, and read the current draft. WebMCP writes to a Zustand store, React renders the staged report immediately, and the "Confirm sighting" button can create a durable record.

## Built with

Next.js, React, TypeScript, Tailwind CSS, Zustand, Supabase, PostgreSQL/PostGIS, Leaflet, and the iNaturalist API.