import type { Metadata } from "next";

import "leaflet/dist/leaflet.css";
import "./globals.css";
import { Providers } from "./providers";

function resolveSiteUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

const description =
  "An AI browsing agent drafts biodiversity sightings through WebMCP tools. A person reviews the draft, adds evidence, and submits it.";

export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteUrl()),
  title: {
    default: "FloraLink: agent-assisted biodiversity reporting",
    template: "%s | FloraLink",
  },
  description,
  openGraph: {
    type: "website",
    siteName: "FloraLink",
    title: "FloraLink: agent-assisted biodiversity reporting",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "FloraLink: agent-assisted biodiversity reporting",
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
