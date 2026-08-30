import Link from "next/link";

export const metadata = { title: "Privacy | FloraLink" };

export default function PrivacyPage() {
  return (
    <main className="content-page">
      <Link href="/" className="back-link">← Back to the map</Link>
      <p className="eyebrow">Privacy</p>
      <h1>What FloraLink collects and publishes</h1>
      <p>
        Before submission, FloraLink stores the staged draft only in this
        browser session. A submitted report retains the human-reviewed species
        guess, observation time, host condition, notes, ecological verification
        provenance, location source and accuracy, report ownership, and any
        processed evidence image. FloraLink does not store the full agent
        conversation or audio.
      </p>
      <h2>Location and public coordinates</h2>
      <p>
        Location is collected to place a sighting and explain its precision.
        Device location is requested only after you choose it; FloraLink never
        watches your position continuously. Public point coordinates are rounded
        to two decimal places, while private reports are excluded from the
        public map. Approximate areas remain approximate.
      </p>
      <h2>Photos and EXIF metadata</h2>
      <p>
        The original photo stays in your browser. FloraLink reads embedded GPS
        only to offer an explicit, human-controlled location fallback, then
        redraws and re-encodes the image before upload. Only that processed copy
        is uploaded, which strips EXIF metadata including GPS coordinates.
      </p>
      <h2>Retention and access</h2>
      <p>
        Submitted reports and processed evidence are retained for the life of
        this hackathon project unless the project owner removes them or responds
        to a valid deletion request. A short-lived signed URL is used to display
        private media. Anonymous ownership is tied to this browser session;
        clearing browser storage removes the easy local path back to that
        ownership, but does not delete the submitted record.
      </p>
      <p>
        For correction or deletion requests, use the contact path on the{" "}
        <Link href="/about#contact">About page</Link>.
      </p>
    </main>
  );
}
