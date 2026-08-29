# FloraLink

FloraLink is a WebMCP-powered application for turning field observations into structured, reviewable biodiversity reports.

The project is designed around human-agent collaboration: an agent can interpret a rough observation, prepare ecological data, and stage a sighting, while the human remains responsible for reviewing and confirming the final report.

## Current Milestone 1 capabilities

- A client-only Leaflet map centered on Massachusetts with visible OpenStreetMap attribution.
- A bounded, sanitized public viewport endpoint for submitted sightings.
- Supabase/PostGIS migrations for reports, media, verification provenance, and regional status.
- Owner-scoped row-level security, a private image bucket, and pgTAP policy tests.
- Anonymous Supabase authentication initialized only when a contribution action is used.

Later milestones add taxonomy verification, WebMCP staging, media processing, and human-confirmed submission. Durable submission is intentionally not part of Milestone 1.

## Local setup

Requirements: Node.js 22, pnpm 9, Docker Desktop, and the Supabase CLI (invoked through `npx`).

```bash
pnpm install
npx supabase start
npx supabase db reset
cp .env.example .env.local
```

Populate `.env.local` with the local URL and keys printed by `npx supabase status`. Keep the service-role key server-only. The local Supabase configuration enables anonymous sign-in; enable anonymous sign-ins in the Supabase Auth provider settings for a hosted project as well.

Run the application and checks:

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm build
```

`npx supabase db reset` applies every migration from zero and loads the non-secret Massachusetts reference fixture from `supabase/seed.sql`.

## Repository structure

```text
FloraLink/
├── docs/                 # Product and implementation specification
├── public/leaflet/       # Local native Leaflet marker assets
├── src/app/              # Next.js pages and route handlers
├── src/components/       # Map and contribution UI
├── src/features/         # Auth and public-report contracts
├── src/lib/              # Supabase SSR clients
└── supabase/             # Config, migrations, seed, and pgTAP tests
```

## License

This project is licensed under the [MIT License](LICENSE).
