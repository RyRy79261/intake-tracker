"use client";

import { useMemo, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useNowTick } from "@intake/ui/use-now-tick";
import { domainStripeStyle, type Domain } from "@/lib/domain-colors";
import { formatTimeOnly, getDayStartTimestamp } from "@/lib/date-utils";
import { recentDayLabel } from "@/lib/week-utils";
import { useSettingsStore } from "@/stores/settings-store";
import { cn } from "@/lib/utils";

interface ModuleCardProps {
  /**
   * The card's domain. Opens a `data-domain` scope: the top stripe and icon
   * take the colour, and so do the card's primary button, selected chips,
   * tab underline, focus rings and carets.
   */
  domain: Domain;
  icon: LucideIcon;
  title: string;
  /** Right-side header stat, e.g. `<b>946ml</b> / 1.0L<br />today`. */
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/**
 * A Home module card (the prototype's `.mod`): a panel with a 3px top stripe
 * in the domain colour, a header with the icon, title and a right-side stat,
 * and the body (form, then the Recent list). The whole card is a domain
 * scope, so its controls are tinted with the same colour.
 */
export function ModuleCard({ domain, icon: Icon, title, right, children, className, ...rest }: ModuleCardProps) {
  return (
    <section
      className={cn("wc-mod", className)}
      data-domain={domain}
      aria-label={title}
      data-testid={rest["data-testid"]}
    >
      <div className="wc-mhead">
        <Icon aria-hidden="true" />
        <span className="t">{title}</span>
        {right != null && right !== false && <span className="r">{right}</span>}
      </div>
      <div className="wc-mbody">{children}</div>
    </section>
  );
}

/**
 * [start, end) of today's logical day (it starts at dayStartHour). Refreshes
 * with the minute tick so it rolls over at the day boundary.
 */
export function useLogicalTodayRange(): [number, number] {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const tick = useNowTick();
  return useMemo(() => {
    const start = new Date(getDayStartTimestamp(dayStartHour));
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    end.setHours(dayStartHour, 0, 0, 0);
    return [start.getTime(), end.getTime()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStartHour, tick]);
}

/**
 * "07:20", or "Yest 07:20" / "Fri 07:20" for an earlier logical day. Re-renders
 * on the minute tick so the prefix appears once the day boundary passes.
 */
export function WhenLabel({ timestamp }: { timestamp: number }) {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  useNowTick();
  const day = recentDayLabel(timestamp, dayStartHour);
  return <>{day ? `${day} ` : ""}{formatTimeOnly(timestamp)}</>;
}

interface SegmentBarProps {
  value: number;
  /** Daily target. 0 draws an empty bar. */
  limit: number;
  /** Allowance past the target before it counts as over the limit. */
  buffer?: number;
  /** Domain colour; defaults to the enclosing `--c`. */
  domain?: Domain | undefined;
  "aria-label": string;
}

/**
 * The 20-segment level bar (the prototype's `.lbar`). Up to the target the
 * filled share is solid; once over it the bar spans the whole total and the
 * part past the target is hatched, or solid with an ink cap once past the
 * limit (target + buffer).
 */
export function SegmentBar({ value, limit, buffer = 0, domain, "aria-label": label }: SegmentBarProps) {
  const over = limit > 0 && value > limit;
  const overLimit = over && value > limit + Math.max(0, buffer);
  const on = limit > 0 ? Math.min(20, Math.round((value / limit) * 20)) : 0;
  const split = over ? Math.round((20 * limit) / value) : 20;
  const cells: Array<"f" | "h" | "x" | ""> = [];
  for (let i = 0; i < 20; i++) {
    if (i >= on) cells.push("");
    else if (over && i >= split) cells.push(overLimit ? "x" : "h");
    else cells.push("f");
  }
  const pct = limit > 0 ? Math.round((value / limit) * 100) : 0;
  return (
    <div
      className="wc-lbar"
      style={domain ? domainStripeStyle(domain) : undefined}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(pct, 100)}
      aria-valuetext={`${pct}% of the target`}
      data-state={overLimit ? "over-limit" : over ? "over-target" : "ok"}
    >
      {cells.map((c, i) => (
        <i key={i} className={c || undefined} />
      ))}
    </div>
  );
}
