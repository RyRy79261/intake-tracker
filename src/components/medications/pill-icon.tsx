"use client";

import { cn } from "@/lib/utils";
import type { PillShape } from "@/lib/db";

interface PillIconProps {
  shape: PillShape;
  color: string;
  size?: number;
  className?: string;
}

export function PillIcon({ shape, color, size = 32, className }: PillIconProps) {
  const half = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
    >
      {shape === "round" && (
        <circle cx={half} cy={half} r={half * 0.8} fill={color} />
      )}
      {shape === "oval" && (
        <ellipse cx={half} cy={half} rx={half * 0.9} ry={half * 0.6} fill={color} />
      )}
      {shape === "capsule" && (
        <rect
          x={size * 0.1}
          y={size * 0.25}
          width={size * 0.8}
          height={size * 0.5}
          rx={size * 0.25}
          fill={color}
        />
      )}
      {shape === "diamond" && (
        <polygon
          points={`${half},${size * 0.1} ${size * 0.9},${half} ${half},${size * 0.9} ${size * 0.1},${half}`}
          fill={color}
        />
      )}
      {shape === "tablet" && (
        <rect
          x={size * 0.15}
          y={size * 0.15}
          width={size * 0.7}
          height={size * 0.7}
          rx={size * 0.12}
          fill={color}
        />
      )}
    </svg>
  );
}

interface PillIconWithBadgeProps extends PillIconProps {
  status?: "taken" | "skipped" | "rescheduled" | "pending";
}

export function PillIconWithBadge({ status, size = 32, ...props }: PillIconWithBadgeProps) {
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <PillIcon size={size} {...props} />
      {status && status !== "pending" && (
        <div
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center",
            status === "taken" && "bg-emerald-500",
            status === "skipped" && "bg-gray-400",
            status === "rescheduled" && "bg-amber-500"
          )}
          style={{ width: size * 0.45, height: size * 0.45 }}
        >
          {status === "taken" && (
            <svg width={size * 0.28} height={size * 0.28} viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {status === "skipped" && (
            <svg width={size * 0.28} height={size * 0.28} viewBox="0 0 12 12" fill="none">
              <path d="M3 3L9 9M9 3L3 9" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {status === "rescheduled" && (
            <svg width={size * 0.28} height={size * 0.28} viewBox="0 0 12 12" fill="none">
              <path d="M6 3V6L8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
