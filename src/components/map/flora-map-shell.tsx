"use client";

import dynamic from "next/dynamic";

const FloraMap = dynamic(() => import("@/components/map/flora-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading" role="status">
      Loading the public sighting map…
    </div>
  ),
});

export function FloraMapShell() {
  return <FloraMap />;
}
