import type { CardThemeKey } from "@/lib/card-themes";

export interface QuickNavItem {
  /** CardThemeKey the item references for icon/color. */
  id: CardThemeKey;
  /** When false, item is hidden from the footer but kept in settings list. */
  enabled: boolean;
}

/**
 * Default footer items -- one per root card visible on the main intake screen.
 * Order matches the visual order in src/app/page.tsx (top-to-bottom).
 * NOTE: "water" theme is used for the Liquids root card; "eating" theme for the
 * Food & Salt root card. Label overrides for these two keys are applied in
 * quick-nav-footer.tsx so the footer reads "Liquids" / "Food & Salt".
 */
export const DEFAULT_QUICK_NAV_ITEMS: QuickNavItem[] = [
  { id: "water", enabled: true },      // Liquids
  { id: "eating", enabled: true },     // Food & Salt
  { id: "bp", enabled: true },         // Blood Pressure
  { id: "weight", enabled: true },     // Weight
  { id: "urination", enabled: true },  // Urination
  { id: "defecation", enabled: true }, // Defecation
];

/** Labels overridden for the footer to match on-screen card titles. */
export const QUICK_NAV_LABEL_OVERRIDES: Partial<Record<CardThemeKey, string>> = {
  water: "Liquids",
  eating: "Food & Salt",
};
