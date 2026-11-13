import Link from "next/link";

import { FloraMapShell } from "@/components/map/flora-map-shell";
import { ContributionButton } from "@/components/reports/contribution-button";
import { DraftAnnouncement } from "@/components/reports/staged-report-card";
import { WebMcpStatusBadge } from "@/features/webmcp/webmcp-status";

export default function Home() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">FloraLink</p>
          <h1 id="page-title">Massachusetts field sightings</h1>
        </div>
        <div className="topbar-actions">
          <nav className="site-nav" aria-label="Project information">
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
          <WebMcpStatusBadge />
          <ContributionButton />
        </div>
      </header>
      <DraftAnnouncement />
      <FloraMapShell />
    </main>
  );
}
