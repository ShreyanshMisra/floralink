import { FloraMapShell } from "@/components/map/flora-map-shell";
import { ContributionButton } from "@/components/reports/contribution-button";

export default function Home() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">FloraLink</p>
          <h1 id="page-title">Massachusetts field sightings</h1>
        </div>
        <div className="topbar-actions">
          <span className="browse-badge">Public map</span>
          <ContributionButton />
        </div>
      </header>
      <FloraMapShell />
    </main>
  );
}
