import type { ReactElement } from "react";

/**
 * Shared building blocks for the `next/og` social cards. Every value is a
 * satori-safe primitive (hex colors, flex divs, inline SVG) — see
 * `opengraph-image.tsx` / `twitter-image.tsx`.
 */
export const COLORS = {
  bg: "#0b1220", // deep slate — richer than the app's #111827 for a share card
  bgTo: "#111a2e",
  fg: "#f1f5f9",
  muted: "#94a3b8",
  waterFrom: "#0ea5e9", // the droplet gradient from public/icons/icon-512.svg
  waterTo: "#0284c7",
  // per-domain accent colors (mirror @intake/ui tokens)
  water: "#29a9e8",
  salt: "#e8973a",
  eating: "#fb7115",
  weight: "#10b788",
  bp: "#f43f6b",
  medication: "#16a181",
} as const;

export const SANS = "Outfit";

const DOMAIN_DOTS = [
  COLORS.water,
  COLORS.salt,
  COLORS.eating,
  COLORS.weight,
  COLORS.bp,
  COLORS.medication,
];

/** The app's water-droplet mark — the exact art from public/icons/icon-512.svg. */
export function Droplet({ size }: { size: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: "flex" }}>
      <defs>
        <linearGradient id="dropGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={COLORS.waterFrom} />
          <stop offset="100%" stopColor={COLORS.waterTo} />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="96" fill="url(#dropGrad)" />
      <g transform="translate(256, 256)">
        <path
          d="M0,-128 C64,-64 96,24 96,72 C96,136 48,160 0,160 C-48,160 -96,136 -96,72 C-96,24 -64,-64 0,-128 Z"
          fill="white"
          opacity="0.95"
        />
        <ellipse cx="-24" cy="48" rx="24" ry="36" fill="white" opacity="0.4" />
      </g>
    </svg>
  );
}

/** A row of the tracked-domain accent colors — the app's palette as a footer. */
export function DomainDots({
  size,
  gap,
}: {
  size: number;
  gap: number;
}): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      {DOMAIN_DOTS.map((c) => (
        <div
          key={c}
          style={{
            display: "flex",
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: c,
          }}
        />
      ))}
    </div>
  );
}
