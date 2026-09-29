"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small Ward Console building blocks shared by the Rx, Meds and Titrations
 * tabs and their drawers: badges, section labels, rule headings, collapsible
 * section headers and the input field style. They mirror the prototype's
 * `.bdg`, `.mlab`, `.sec`, `.collh` and `.field` classes.
 */

export type BdgTone = "meds" | "weight" | "sodium" | "bp" | "water" | "muted";
/** outline = `.bdg`, fill = `.bdg.f` (inverse block), tint = `.bdg.t`. */
export type BdgKind = "outline" | "fill" | "tint";

const TONE: Record<BdgTone, { outline: string; fill: string; tint: string }> = {
  meds: { outline: "border-meds text-meds", fill: "border-meds bg-meds text-on-domain", tint: "border-meds text-meds bg-meds/15" },
  weight: { outline: "border-weight text-weight", fill: "border-weight bg-weight text-on-domain", tint: "border-weight text-weight bg-weight/15" },
  sodium: { outline: "border-sodium text-sodium", fill: "border-sodium bg-sodium text-on-domain", tint: "border-sodium text-sodium bg-sodium/15" },
  bp: { outline: "border-bp text-bp", fill: "border-bp bg-bp text-on-domain", tint: "border-bp text-bp bg-bp/15" },
  water: { outline: "border-water text-water", fill: "border-water bg-water text-on-domain", tint: "border-water text-water bg-water/15" },
  muted: {
    outline: "border-muted-foreground text-muted-foreground",
    fill: "border-muted-foreground bg-muted-foreground text-background",
    tint: "border-muted-foreground text-muted-foreground bg-foreground/8",
  },
};

export function Bdg({
  tone,
  kind = "outline",
  className,
  children,
}: {
  tone: BdgTone;
  kind?: BdgKind;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap border px-[5px] py-[3px] text-[0.625rem] font-semibold leading-none",
        TONE[tone][kind],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The small caps section label inside cards and drawers (`.mlab`). */
export function MLabel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p
      className={cn(
        "mb-1.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** A list heading with a 1px rule running to the right edge (`.sec`). */
export function SecHead({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h3
      className={cn(
        "mb-1.5 mt-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground first:mt-0.5 after:h-px after:flex-1 after:bg-line",
        className,
      )}
    >
      {children}
    </h3>
  );
}

/**
 * A collapsible section header: label, a rule, and a chevron (`.collh`).
 * `sub` is the in-section variant (a generic-name group in Meds).
 */
export function CollapseHead({
  open,
  onToggle,
  sub = false,
  className,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  sub?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 text-left",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        sub
          ? "text-[0.8125rem] font-medium text-foreground"
          : "mt-2.5 text-xs font-semibold tracking-[0.06em] text-muted-foreground",
        className,
      )}
    >
      <span>{children}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      <ChevronDown
        aria-hidden="true"
        className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
      />
    </button>
  );
}

/** The prototype's `.field`: 40px, sharp, 1px muted border. */
export const fieldClass =
  "h-10 w-full rounded-none border border-input bg-background px-2.5 text-[0.9375rem] text-foreground " +
  "placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The prototype's `.dlg` over the shared centred `DialogContent`: panel
 * surface, a meds-coloured top rule, no padding (header and body add their
 * own), capped to the viewport so long content scrolls.
 */
export const dlgClass =
  "flex w-[calc(100%-24px)] max-w-[460px] flex-col gap-0 border-line bg-panel p-0 shadow-[inset_0_3px_0_hsl(var(--meds))]";

/** The full-width dashed "+ Add …" button at the bottom of a list (`.addfull`). */
export const addFullClass = "mt-3.5 h-12 w-full border-dashed";

/** `.an-warn`: amber boxed warning with a bold first line. */
export function WarnBox({ title, className, children }: { title?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div
      role="note"
      className={cn(
        "border border-sodium bg-sodium/10 px-2.5 py-2 text-[0.8125rem] leading-[1.45]",
        className,
      )}
    >
      {title && <b className="mb-0.5 block font-semibold text-sodium">{title}</b>}
      {children}
    </div>
  );
}
