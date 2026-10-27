"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Overview" },
  { href: "/season", label: "Season" },
  { href: "/teams", label: "Teams" },
  { href: "/players", label: "Players" },
  { href: "/forecasting", label: "Forecasting" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Sections" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 px-3 py-2.5 text-[14px] whitespace-nowrap transition-colors ${
              active ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
