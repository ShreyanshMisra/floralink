import Link from "next/link";

export const metadata = { title: "Privacy | FloraLink" };

export default function PrivacyPage() {
  return (
    <main className="content-page">
      <Link href="/" className="back-link">← Back to the map</Link>
      <p className="eyebrow">Privacy</p>
      <h1>What FloraLink collects and publishes</h1>
      <p>
        Unsubmitted drafts stay in your browser. Submitted reports save your
        reviewed species, time, location accuracy, and a processed photo. We
        never store agent conversations or audio.
      </p>
      <h2>Location and public coordinates</h2>
      <p>
        We only request device location when you explicitly ask. To protect
        privacy, public map coordinates are rounded to two decimal places.
      </p>
      <h2>Photos and EXIF metadata</h2>
      <p>
        We strip all hidden GPS and EXIF metadata from your photos in the browser
        before they are uploaded.
      </p>
      <h2>Retention and access</h2>
      <p>
        Data is kept for the duration of this hackathon. Clearing your browser
        storage removes your local access to your anonymous session.
      </p>
    </main>
  );
}
