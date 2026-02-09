"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CARD_THEMES, UTILITY_THEMES, type CardThemeKey } from "@/lib/card-themes";

// ── Section nav items (scrollable gallery) ──────────────────

interface SectionNavItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconColor: string;
  bgColor: string;
}

function buildSectionItems(): SectionNavItem[] {
  return (Object.keys(CARD_THEMES) as CardThemeKey[]).map((key) => {
    const theme = CARD_THEMES[key];
    return {
      id: theme.sectionId,
      icon: theme.icon,
      label: theme.label,
      iconColor: theme.iconColor,
      bgColor: theme.iconBg,
    };
  });
}

const SECTION_ITEMS = buildSectionItems();

// ── Utility items (fixed row) ───────────────────────────────

const FOOD_ITEM = {
  icon: UTILITY_THEMES.food.icon,
  label: UTILITY_THEMES.food.label,
  iconColor: UTILITY_THEMES.food.iconColor,
  bgColor: UTILITY_THEMES.food.iconBg,
};

const AI_ITEM = {
  icon: UTILITY_THEMES.ai.icon,
  label: UTILITY_THEMES.ai.label,
  iconColor: UTILITY_THEMES.ai.iconColor,
  bgColor: UTILITY_THEMES.ai.iconBg,
};

// ── Component ───────────────────────────────────────────────

interface QuickNavFooterProps {
  hidden: boolean;
  order: "ltr" | "rtl";
  utilityOrder: "ai-right" | "food-right";
  transitionDuration?: number;
  onScrollTo: (sectionId: string) => void;
  onOpenFoodCalculator: () => void;
  onOpenVoiceInput: () => void;
}

export function QuickNavFooter({
  hidden,
  order,
  utilityOrder,
  transitionDuration = 0.2,
  onScrollTo,
  onOpenFoodCalculator,
  onOpenVoiceInput,
}: QuickNavFooterProps) {
  // Order section items based on LTR/RTL preference
  const orderedSections = useMemo(
    () => (order === "rtl" ? [...SECTION_ITEMS].reverse() : SECTION_ITEMS),
    [order]
  );

  // Build utility row: two buttons ordered by utilityOrder setting
  const utilityLeft = utilityOrder === "ai-right" ? FOOD_ITEM : AI_ITEM;
  const utilityRight = utilityOrder === "ai-right" ? AI_ITEM : FOOD_ITEM;
  const onClickLeft = utilityOrder === "ai-right" ? onOpenFoodCalculator : onOpenVoiceInput;
  const onClickRight = utilityOrder === "ai-right" ? onOpenVoiceInput : onOpenFoodCalculator;

  return (
    <motion.footer
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-gradient-to-t from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      animate={{ y: hidden ? "100%" : 0 }}
      transition={{ duration: transitionDuration, ease: "easeInOut" }}
    >
      {/* Row 1: Section gallery — evenly distributed */}
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

      {/* Row 2: Utility buttons (Food Calculator & AI) */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-0.5">
        <UtilityButton item={utilityLeft} onClick={onClickLeft} />
        <UtilityButton item={utilityRight} onClick={onClickRight} />
      </div>
    </motion.footer>
  );
}

// ── Utility button ──────────────────────────────────────────

function UtilityButton({
  item,
  onClick,
}: {
  item: { icon: React.ComponentType<{ className?: string }>; label: string; iconColor: string; bgColor: string };
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 py-1.5 rounded-xl transition-colors",
        "hover:bg-muted/80 active:scale-[0.98] active:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      title={item.label}
    >
      <div className={cn("p-1 rounded-lg", item.bgColor)}>
        <item.icon className={cn("w-3.5 h-3.5", item.iconColor)} />
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {item.label}
      </span>
    </button>
  );
}
