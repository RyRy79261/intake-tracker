import type { ReactElement } from "react";
import type { ShellIconName } from "@/lib/nav-routes";
import { cn } from "@/lib/utils";

/**
 * Ward Console line icons: 24 grid, 1.5 stroke, square caps, mitred joins.
 * Ported from the ward-console-4 prototype so the shell matches it exactly.
 */
const PATHS: Record<ShellIconName, ReactElement> = {
  drop: <path d="M12 3.5 6.6 11.2a6 6 0 1 0 10.8 0Z" />,
  cup: (
    <>
      <path d="M4.5 8h12v5.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5Z" />
      <path d="M16.5 10h1.5a2.5 2.5 0 0 1 0 5h-1.8" />
      <path d="M8 3.5v2M12 3.5v2" />
      <path d="M4 21h14" />
    </>
  ),
  food: (
    <>
      <path d="M6 3v6.5a2 2 0 0 0 4 0V3M8 3v18" />
      <path d="M18 21V3c-2.2 1.2-3.5 4-3.5 7.5V13H18" />
    </>
  ),
  bp: (
    <>
      <path d="M12 20 4.6 12.6a4.4 4.4 0 0 1 6.3-6.3L12 7.4l1.1-1.1a4.4 4.4 0 0 1 6.3 6.3Z" />
      <path d="M3 12.5h4.5l1.5-2.5 2.5 5 1.8-3h7.7" />
    </>
  ),
  weight: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M7.5 10.5a5.5 5.5 0 0 1 9 0" />
      <path d="M12 11.5l1.8-2.8" />
    </>
  ),
  wee: (
    <>
      <path d="M12 3.5 8 9.5a4.5 4.5 0 1 0 8 0Z" />
      <path d="M5 20.5h14" />
    </>
  ),
  bowel: (
    <>
      <path d="M6 3.5h5V11H6z" />
      <path d="M4 11h16v1a7 7 0 0 1-7 7h-1.5l1 2.5" />
      <path d="M8.5 21h7" />
    </>
  ),
  pill: (
    <>
      <path
        d="M9.2 4.9a3.9 3.9 0 0 1 5.5 0l4.4 4.4a3.9 3.9 0 0 1-5.5 5.5L9.2 10.4a3.9 3.9 0 0 1 0-5.5Z"
        transform="translate(-2 2.5)"
      />
      <path d="M9.4 12.8l4.5-4.5" />
    </>
  ),
  metrics: (
    <>
      <path d="M4 3.5V20h16.5" />
      <path d="M8 16.5V12M12 16.5V7.5M16 16.5v-6" />
    </>
  ),
  history: <path d="M4 6h2.5M4 12h2.5M4 18h2.5M9.5 6H20M9.5 12H20M9.5 18H20" />,
  profile: (
    <>
      <path d="M8 7.5a4 4 0 1 0 8 0 4 4 0 1 0-8 0" />
      <path d="M4.5 20.5v-1a5.5 5.5 0 0 1 5.5-5.5h4a5.5 5.5 0 0 1 5.5 5.5v1" />
    </>
  ),
  mic: (
    <>
      <path d="M9 6.5a3 3 0 0 1 6 0V11a3 3 0 0 1-6 0Z" />
      <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v3.5M8.5 20.5h7" />
    </>
  ),
  gear: (
    <>
      <path d="M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0" />
      <path d="M10.2 3.5h3.6l.5 2.4 1.9 1.1 2.3-.8 1.8 3.1-1.8 1.6v2.2l1.8 1.6-1.8 3.1-2.3-.8-1.9 1.1-.5 2.4h-3.6l-.5-2.4-1.9-1.1-2.3.8-1.8-3.1 1.8-1.6v-2.2L3.7 9.3l1.8-3.1 2.3.8 1.9-1.1Z" />
    </>
  ),
  home: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  windows: (
    <>
      <path d="M3.5 8h12v12h-12z" />
      <path d="M8.5 8V4h12v12h-5" />
    </>
  ),
  tidy: <path d="M3.5 4h7.5v16H3.5zM13 4h7.5v7.5H13zM13 13.5h7.5V20H13z" />,
  today: <path d="M4 5.5h16v15H4zM4 10h16M8 3.5v4M16 3.5v4M8 14h3v3H8z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M20 12H5M11 6l-6 6 6 6" />,
  book: (
    <>
      <path d="M3.5 5.5c3-1.3 5.8-1.3 8.5.5v14c-2.7-1.8-5.5-1.8-8.5-.5Z" />
      <path d="M20.5 5.5c-3-1.3-5.8-1.3-8.5.5v14c2.7-1.8 5.5-1.8 8.5-.5Z" />
    </>
  ),
};

interface ShellIconProps {
  name: ShellIconName;
  /** Rendered size in px (16, 20, 24). */
  size?: number;
  className?: string;
}

export function ShellIcon({ name, size = 24, className }: ShellIconProps) {
  return (
    <svg
      className={cn("block shrink-0", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The app mark (same drawing as public/icons/icon-192.svg). */
export function ShellLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 192 192"
      className="block shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="wardShellLogo" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <rect width="192" height="192" rx="32" fill="url(#wardShellLogo)" />
      <g transform="translate(96 96)">
        <path
          d="M0,-48 C24,-24 32,8 32,24 C32,48 16,56 0,56 C-16,56 -32,48 -32,24 C-32,8 -24,-24 0,-48 Z"
          fill="white"
          opacity="0.95"
        />
        <ellipse cx="-8" cy="16" rx="8" ry="12" fill="white" opacity="0.4" />
      </g>
    </svg>
  );
}
