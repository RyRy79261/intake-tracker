"use client";

import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CARD_THEMES, UTILITY_THEMES, type CardThemeKey, type UtilityThemeKey } from "@/lib/card-themes";

interface NavItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconColor: string;
  bgColor: string;
  type: "section" | "utility";
}

function buildNavItems(): NavItem[] {
  const sectionItems: NavItem[] = (Object.keys(CARD_THEMES) as CardThemeKey[]).map((key) => {
    const theme = CARD_THEMES[key];
    return {
      id: theme.sectionId,
      icon: theme.icon,
      label: theme.label,
      iconColor: theme.iconColor,
      bgColor: theme.iconBg,
      type: "section" as const,
    };
  });

  const utilityItems: NavItem[] = (Object.keys(UTILITY_THEMES) as UtilityThemeKey[]).map((key) => {
    const theme = UTILITY_THEMES[key];
    return {
      id: `utility-${key}`,
      icon: theme.icon,
      label: theme.label,
      iconColor: theme.iconColor,
      bgColor: theme.iconBg,
      type: "utility" as const,
    };
  });

  return [...sectionItems, ...utilityItems];
}

const NAV_ITEMS = buildNavItems();

interface QuickNavFooterProps {
  hidden: boolean;
  order: "ltr" | "rtl";
  transitionDuration?: number;
  onScrollTo: (sectionId: string) => void;
  onOpenFoodCalculator: () => void;
  onOpenVoiceInput: () => void;
}

export function QuickNavFooter({
  hidden,
  order,
  transitionDuration = 0.2,
  onScrollTo,
  onOpenFoodCalculator,
  onOpenVoiceInput,
}: QuickNavFooterProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Order items: RTL reverses section icons, and puts utility icons before sections
  const orderedItems = (() => {
    const sections = NAV_ITEMS.filter((item) => item.type === "section");
    const utilities = NAV_ITEMS.filter((item) => item.type === "utility");

    if (order === "rtl") {
      // RTL: utilities on left, sections reversed (so top-of-page = rightmost)
      return [...utilities.reverse(), ...sections.reverse()];
    }
    // LTR: sections in page order, utilities at end
    return [...sections, ...utilities];
  })();

  // Auto-scroll to the right end on mount for RTL so most-used icons are visible
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (order === "rtl") {
      container.scrollLeft = container.scrollWidth;
    } else {
      container.scrollLeft = 0;
    }
  }, [order]);

  const handleItemClick = (item: NavItem) => {
    if (item.id === "utility-food") {
      onOpenFoodCalculator();
    } else if (item.id === "utility-ai") {
      onOpenVoiceInput();
    } else {
      onScrollTo(item.id);
    }
  };

  // Find divider position: between utilities and sections
  const dividerIndex = orderedItems.findIndex((item, i) => {
    if (i === 0) return false;
    return orderedItems[i - 1].type !== item.type;
  });

  return (
    <motion.footer
      className="fixed bottom-0 left-0 right-0 z-40 border-t bg-gradient-to-t from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      animate={{ y: hidden ? "100%" : 0 }}
      transition={{ duration: transitionDuration, ease: "easeInOut" }}
    >
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {orderedItems.map((item, index) => (
          <div key={item.id} className="flex items-center shrink-0" style={{ scrollSnapAlign: "center" }}>
            {/* Divider between section and utility groups */}
            {index === dividerIndex && (
              <div className="w-px h-8 bg-border mx-1 shrink-0" />
            )}
            <button
              onClick={() => handleItemClick(item)}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-colors",
                "hover:bg-muted/80 active:scale-95 active:bg-muted",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              title={item.label}
            >
              <div className={cn("p-1.5 rounded-lg", item.bgColor)}>
                <item.icon className={cn("w-4 h-4", item.iconColor)} />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground leading-none">
                {item.label}
              </span>
            </button>
          </div>
        ))}
      </div>
    </motion.footer>
  );
}
