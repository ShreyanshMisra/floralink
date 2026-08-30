"use client";

import { useWebMcpStatus } from "@/features/webmcp/webmcp-provider";

const labels = {
  unsupported: "Agent tools unavailable",
  registering: "Agent tools connecting",
  ready: "Agent tools ready",
  error: "Agent tools unavailable",
};

export function WebMcpStatusBadge() {
  const status = useWebMcpStatus();
  return (
    <div className="webmcp-capability">
      <span className={`webmcp-badge webmcp-${status}`}>{labels[status]}</span>
      {status === "unsupported" || status === "error" ? (
        <span className="webmcp-fallback">
          Agent tools unavailable in this browser; manual reporting still works.
        </span>
      ) : null}
    </div>
  );
}
