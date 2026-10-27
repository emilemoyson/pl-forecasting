"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { Club, Standing } from "@/lib/queries";
import { crestUrl } from "./Crest";

const UK_BOUNDS: L.LatLngBoundsExpression = [[50.65, -3.2], [55.05, 0.25]];
// Places where several grounds sit close together
const CLUSTERS: { label: string; center: L.LatLngExpression; zoom: number }[] = [
  { label: "London", center: [51.505, -0.15], zoom: 11 },
  { label: "Manchester", center: [53.475, -2.25], zoom: 12 },
  { label: "Merseyside", center: [53.428, -2.98], zoom: 13 },
  { label: "North East", center: [54.93, -1.5], zoom: 10.5 },
];
// Esri canvas basemaps: free with attribution, no API key, light and dark versions.
const TILES = {
  light: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  dark: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
};

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const forced = document.documentElement.dataset.theme;
      setDark(forced ? forced === "dark" : mq.matches);
    };
    read();
    mq.addEventListener("change", read);
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", read);
      obs.disconnect();
    };
  }, []);
  return dark;
}

function crestIcon(club: Club, size: number) {
  return L.divIcon({
    className: "club-marker",
    html: `<img src="${crestUrl(club.badgeCode)}" alt="${club.team}" width="${size}" height="${size}"
             onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'club-marker-fallback',textContent:'${club.code}'}))" />`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function Controls() {
  const map = useMap();
  const btn =
    "rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] font-medium text-ink shadow-sm hover:bg-hover";
  return (
    <div className="absolute top-3 right-3 z-[1000] flex max-w-[70%] flex-wrap justify-end gap-2">
      {CLUSTERS.map((c) => (
        <button key={c.label} type="button" className={btn} onClick={() => map.flyTo(c.center, c.zoom, { duration: 1 })}>
          {c.label}
        </button>
      ))}
      <button type="button" className={btn} onClick={() => map.flyToBounds(UK_BOUNDS, { duration: 1, padding: [24, 24] })}>
        Whole map
      </button>
    </div>
  );
}

/** England with every club's crest at its ground. Click a crest for its season. */
export default function ClubMap({ clubs, standings }: { clubs: Club[]; standings: Standing[] }) {
  const dark = useDarkMode();
  const byTeam = useMemo(() => new Map(standings.map((s) => [s.team, s])), [standings]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-line" style={{ height: 560 }}>
      <MapContainer
        bounds={UK_BOUNDS}
        boundsOptions={{ padding: [24, 24] }}
        zoomSnap={0.25}
        scrollWheelZoom={false}
        className="h-full w-full"
        style={{ background: "var(--page)" }}
        attributionControl
      >
        <TileLayer
          key={dark ? "dark" : "light"}
          url={dark ? TILES.dark : TILES.light}
          attribution="Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
          maxZoom={16}
        />
        {clubs.map((club) => {
          const s = byTeam.get(club.team);
          return (
            <Marker key={club.team} position={[club.lat, club.lon]} icon={crestIcon(club, 34)}
                    title={club.team} alt={club.team} riseOnHover>
              <Popup>
                <div className="min-w-[180px] text-[13px]">
                  <div className="font-semibold">{club.team}</div>
                  <div className="text-[12px] opacity-70">{club.stadium} · {club.area}</div>
                  {s && (
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px]">
                      <span>Finished</span><span className="tabular text-right font-medium">{ordinal(s.rank)}</span>
                      <span>Points</span><span className="tabular text-right font-medium">{s.points}</span>
                      <span>W-D-L</span><span className="tabular text-right font-medium">{s.won}-{s.drawn}-{s.lost}</span>
                      <span>Goal difference</span><span className="tabular text-right font-medium">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
                    </div>
                  )}
                  <Link href={`/teams/${encodeURIComponent(club.team)}`} className="mt-2 inline-block text-[12px] underline">
                    Club page
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
        <Controls />
      </MapContainer>
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
