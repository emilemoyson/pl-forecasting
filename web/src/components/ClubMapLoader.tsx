"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` on import, so the map only loads in the browser.
export const ClubMapLoader = dynamic(() => import("./ClubMap"), {
  ssr: false,
  loading: () => <div className="rounded-lg border border-line bg-page" style={{ height: 560 }} />,
});
