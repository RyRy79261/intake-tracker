"use client";

import { useEffect, useState } from "react";
import { ShellIcon } from "@/components/shell/shell-icon";
import type { Domain } from "@/lib/domain-colors";
import type { ShellIconName } from "@/lib/nav-routes";
import { cn } from "@/lib/utils";

/** Quick links strip height, above the bottom bar; Home pads by this much. */
export const QUICK_LINKS_HEIGHT_PX = 48;

interface QuickLink {
  /** The id of the Home section it scrolls to (home-page-body.tsx). */
  section: string;
  label: string;
  icon: ShellIconName;
  domain: Domain;
}

/** Home's module cards, in the order they appear on Home. */
export const QUICK_LINKS: readonly QuickLink[] = [
  { section: "section-water", label: "Liquids", icon: "drop", domain: "water" },
  { section: "section-food-salt", label: "Food", icon: "food", domain: "sodium" },
  { section: "section-bp", label: "BP", icon: "bp", domain: "bp" },
  { section: "section-weight", label: "Weight", icon: "weight", domain: "weight" },
  { section: "section-urination", label: "Urine", icon: "wee", domain: "bath" },
  { section: "section-defecation", label: "Bowel", icon: "bowel", domain: "bath" },
];

/**
 * The section in view: the last one whose top has passed the line under the
 * sys-bar (a third of the way down the screen), or null above the first.
 */
function sectionInView(): string | null {
  const line = window.innerHeight / 3;
  let current: string | null = null;
  for (const { section } of QUICK_LINKS) {
    const el = document.getElementById(section);
    if (el && el.getBoundingClientRect().top <= line) current = section;
  }
  return current;
}

/**
 * Phone Home: a strip of links above the bottom bar, one per module card,
 * each in its domain colour. A tap scrolls Home to the card; the card in view
 * is marked (a rule on top and `aria-current`).
 */
export function QuickLinks() {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCurrent(sectionInView()));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <nav
      aria-label="Jump to"
      data-testid="quick-links"
      className="fixed inset-x-0 z-40 grid grid-cols-6 border-t border-line bg-chrome px-1.5 bottom-[calc(56px+env(safe-area-inset-bottom,0px))]"
      style={{ height: QUICK_LINKS_HEIGHT_PX }}
    >
      {QUICK_LINKS.map(({ section, label, icon, domain }) => {
        const on = current === section;
        return (
          <button
            key={section}
            type="button"
            data-domain={domain}
            aria-current={on || undefined}
            onClick={() => {
              document.getElementById(section)?.scrollIntoView({ block: "start" });
              setCurrent(section);
            }}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-0.5 text-[color:var(--c)] hover:bg-foreground/4",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              on && "shadow-[inset_0_2px_0_var(--c)] bg-foreground/4",
            )}
          >
            <ShellIcon name={icon} size={18} />
            <span className={cn("max-w-full truncate text-[0.6875rem] leading-none text-foreground", on && "font-semibold")}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
