"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CARD_THEMES } from "@/lib/card-themes";
import {
  QUICK_NAV_LABEL_OVERRIDES,
  type QuickNavItem,
} from "@/lib/quick-nav-defaults";

// ── Component ───────────────────────────────────────────────

interface QuickNavFooterProps {
  hidden: boolean;
  order: "ltr" | "rtl";
  transitionDuration?: number;
  quickNavItems: QuickNavItem[];
  onScrollTo: (sectionId: string) => void;
}

export function QuickNavFooter({
  hidden,
  order,
  transitionDuration = 0.2,
  quickNavItems,
  onScrollTo,
}: QuickNavFooterProps) {
  // Build the render list from the configured items, filtering out disabled
  // entries. RTL reversal is applied AFTER filtering so the user's configured
  // order is preserved on both axes.
  const orderedSections = useMemo(() => {
    const enabled = quickNavItems
      .filter((item) => item.enabled)
      .map((item) => {
        const theme = CARD_THEMES[item.id];
        return {
          id: theme.sectionId,
          icon: theme.icon,
          label: QUICK_NAV_LABEL_OVERRIDES[item.id] ?? theme.label,
          iconColor: theme.iconColor,
          bgColor: theme.iconBg,
        };
      });
    return order === "rtl" ? enabled.reverse() : enabled;
  }, [quickNavItems, order]);

  // D-06: hide entirely when zero items are enabled
  if (orderedSections.length === 0) return null;

  return (
    <motion.footer
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-gradient-to-t from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      animate={{ y: hidden ? "100%" : 0 }}
      transition={{ duration: transitionDuration, ease: "easeInOut" }}
    >
      {/* Section gallery -- evenly distributed */}
      <div className="flex items-center px-2 py-1.5">
        {orderedSections.map((item) => (
          <div key={item.id} className="flex-1 flex justify-evenly">
            <button
              onClick={() => onScrollTo(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 w-14 px-1 py-1.5 rounded-xl transition-colors",
                "hover:bg-muted/80 active:scale-95 active:bg-muted",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              title={item.label}
            >
              <div className={cn("p-1.5 rounded-lg", item.bgColor)}>
                <item.icon className={cn("w-4 h-4", item.iconColor)} />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground leading-tight h-5 flex items-center text-center">
                {item.label}
              </span>
            </button>
          </div>
        ))}
      </div>
    </motion.footer>
  );
}
