"use client";

import { useEffect, useState } from "react";

// Recharts writes colors into SVG attributes, so read the CSS tokens once and
// again whenever the theme flips. Defaults are the light values for SSR.
const TOKEN_NAMES = [
  "surface", "text-primary", "text-secondary", "text-muted", "grid", "axis", "border",
  "series-1", "series-2", "series-3", "series-4", "neutral-mark", "diverge-pos", "diverge-neg",
] as const;
export type Tokens = Record<(typeof TOKEN_NAMES)[number], string>;
const LIGHT: Tokens = {
  surface: "#fcfcfb", "text-primary": "#0b0b0b", "text-secondary": "#52514e", "text-muted": "#898781",
  grid: "#e1e0d9", axis: "#c3c2b7", border: "rgba(11,11,11,0.1)", "series-1": "#2a78d6",
  "series-2": "#eb6834", "series-3": "#1baf7a", "series-4": "#eda100", "neutral-mark": "#c3c2b7",
  "diverge-pos": "#2a78d6", "diverge-neg": "#e34948",
};

export function useTokens(): Tokens {
  const [tokens, setTokens] = useState<Tokens>(LIGHT);
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const next = { ...LIGHT };
      for (const name of TOKEN_NAMES) next[name] = style.getPropertyValue(`--${name}`).trim() || LIGHT[name];
      setTokens(next);
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    // A data-theme attribute on <html> overrides the OS setting, so watch it too
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", read);
      obs.disconnect();
    };
  }, []);
  return tokens;
}

export function axisProps(t: Tokens) {
  return {
    stroke: t.axis,
    tick: { fill: t["text-muted"], fontSize: 12 },
    tickLine: false,
    axisLine: { stroke: t.axis },
  };
}

export type TipRow = { label: string; value: string; color?: string };

export function TipBox({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-sm">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-ink-2">
          {r.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />}
          <span>{r.label}</span>
          <span className="tabular ml-auto pl-4 font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

