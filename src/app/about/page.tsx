import Link from "next/link";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <main className="content-page">
      <Link href="/" className="back-link">← Back to the map</Link>
      <p className="eyebrow">About FloraLink</p>
      <h1>Human-reviewed biodiversity reporting</h1>
      <p>
        FloraLink helps AI agents research and stage ecological sightings, but
        the agent cannot submit them. A human must review the draft, attach an
        evidence photo, and click confirm.
      </p>
      <h2>Scientific context, not a diagnosis</h2>
      <p>
        Taxonomy is sourced from iNaturalist. Regional alerts only appear when
        backed by official records. Local sightings provide context, but
        uncertainty is always kept visible.
      </p>
      <h2 id="contact">Questions or data requests</h2>
      <p>
        Please use the project&apos;s{" "}
        <a href="https://github.com/ShreyanshMisra/floralink/issues" rel="noreferrer">
          GitHub issue tracker
        </a>{" "}
        to report problems or request help with a submitted record.
      </p>
    </main>
  );
}
