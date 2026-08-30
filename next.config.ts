import "./src/env";

import type { NextConfig } from "next";

function originFromUrl(value: string) {
  try {
    return new URL(value.replace(/\{[^}]+\}/g, "placeholder")).origin;
  } catch {
    return null;
  }
}

const supabaseOrigin = originFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const tileOrigin = originFromUrl(process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "");
const inaturalistOrigin = originFromUrl(
  process.env.INATURALIST_BASE_URL ?? "https://api.inaturalist.org/v1",
);
const sourceList = (values: Array<string | null>) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].join(
    " ",
  );

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src ${sourceList(["'self'", "data:", "blob:", tileOrigin, supabaseOrigin, "https://*.tile.openstreetmap.org", "https://*.inaturalist.org", "https://*.inaturalist-open-data.s3.amazonaws.com"])}`,
  `connect-src ${sourceList(["'self'", supabaseOrigin, supabaseOrigin?.replace("https://", "wss://") ?? null, inaturalistOrigin])}`,
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

export const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(self), microphone=()",
  },
];

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
