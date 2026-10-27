"use client";

import { useState } from "react";

export const crestUrl = (badgeCode: string) =>
  `https://resources.premierleague.com/premierleague/badges/100/t${badgeCode}.png`;

/** Club crest from the Premier League image server, with a monogram if it fails to load. */
export function Crest({
  badgeCode,
  code,
  team,
  size = 24,
  className = "",
}: {
  badgeCode: string;
  code: string;
  team: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        role="img"
        aria-label={team}
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-page font-semibold text-ink-2 ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.32) }}
      >
        {code}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={crestUrl(badgeCode)}
      alt={team}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
