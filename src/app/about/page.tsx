import Link from "next/link";

export const metadata = { title: "About | FloraLink" };

export default function AboutPage() {
  return (
    <main className="content-page">
      <Link href="/" className="back-link">← Back to the map</Link>
      <p className="eyebrow">About FloraLink</p>
      <h1>Human-reviewed biodiversity reporting</h1>
      <p>
        FloraLink helps a browsing agent research a possible taxon, summarize
        ecological context, and stage a sighting. The agent cannot publish it.
        A person reviews and edits every durable report, chooses any evidence
        photo, acknowledges location precision, and presses the final
        confirmation button.
      </p>
      <h2>Scientific context, not a diagnosis</h2>
      <p>
        Taxonomy suggestions come from iNaturalist. Regional status is shown
        only when a matching authority record exists. Nearby observations are
        context and never prove presence, absence, invasiveness, or protection.
        Uncertainty stays visible in the review.
      </p>
      <h2 id="contact">Questions or data requests</h2>
      <p>
        Use the project&apos;s{" "}
        <a href="https://github.com/ShreyanshMisra/floralink/issues" rel="noreferrer">
          GitHub issue tracker
        </a>{" "}
        to report a problem or request help concerning a submitted record.
      </p>
      <p><Link href="/privacy">Read the privacy notice</Link></p>
    </main>
  );
}
