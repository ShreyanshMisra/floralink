"use client";

import { WebMcpProvider } from "@/features/webmcp/webmcp-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return <WebMcpProvider>{children}</WebMcpProvider>;
}
