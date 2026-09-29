import {
  Droplets,
  Sparkles,
  Scale,
  Heart,
  Utensils,
  Droplet,
  CircleDot,
  Coffee,
  Wine,
  Candy,
  Banana,
  type LucideIcon,
} from "lucide-react";
import { DOMAIN_CLASSES, type Domain } from "@/lib/domain-colors";

export interface CardTheme {
  label: string;
  icon: LucideIcon;
  /** The Ward Console domain whose colour this theme uses. */
  domain: Domain;
  gradient: string;
  border: string;
  iconBg: string;
  iconColor: string;
  buttonBg: string;
  outlineBorder: string;
  outlineText: string;
  progressGradient: string;
  progressExtended: string;
  progressOverLimit: string;
  hoverBg: string;
  inputBg: string;
  inputText: string;
  loadingBg: string;
  latestValueColor: string;
  activeToggle: string;
  sectionId: string;
}

/**
 * Flat Ward Console styling for a domain. The field names are kept from the
 * old gradient themes so the cards need no restructuring (that is PR 4):
 * `gradient` is now a flat panel, `iconBg` no longer paints a pastel chip, and
 * every accent comes from the domain token via `DOMAIN_CLASSES`.
 */
function flatTheme(
  domain: Domain,
  meta: { label: string; icon: LucideIcon; sectionId: string },
): CardTheme {
  const c = DOMAIN_CLASSES[domain];
  return {
    ...meta,
    domain,
    gradient: "bg-card",
    border: "border-line",
    iconBg: "bg-transparent",
    iconColor: c.text,
    buttonBg: c.solid,
    outlineBorder: c.border,
    outlineText: c.text,
    progressGradient: c.fill,
    progressExtended: `${c.fill} opacity-60`,
    progressOverLimit: "bg-bp",
    hoverBg: c.hover,
    inputBg: c.tint,
    inputText: c.text,
    loadingBg: "bg-foreground/10",
    latestValueColor: c.text,
    activeToggle: c.active,
  };
}

export const CARD_THEMES = {
  water: flatTheme("water", { label: "Water", icon: Droplets, sectionId: "section-water" }),
  salt: flatTheme("sodium", { label: "Sodium", icon: Sparkles, sectionId: "section-salt" }),
  sugar: flatTheme("sugar", { label: "Sugar", icon: Candy, sectionId: "section-food-salt" }),
  potassium: flatTheme("alcohol", { label: "Potassium", icon: Banana, sectionId: "section-food-salt" }),
  weight: flatTheme("weight", { label: "Weight", icon: Scale, sectionId: "section-weight" }),
  bp: flatTheme("bp", { label: "Blood Pressure", icon: Heart, sectionId: "section-bp" }),
  eating: flatTheme("sodium", { label: "Eating", icon: Utensils, sectionId: "section-food-salt" }),
  urination: flatTheme("bath", { label: "Urination", icon: Droplet, sectionId: "section-urination" }),
  defecation: flatTheme("bath", { label: "Defecation", icon: CircleDot, sectionId: "section-defecation" }),
  caffeine: flatTheme("caffeine", { label: "Caffeine", icon: Coffee, sectionId: "section-caffeine" }),
  alcohol: flatTheme("alcohol", { label: "Alcohol", icon: Wine, sectionId: "section-alcohol" }),
} as const satisfies Record<string, CardTheme>;

export type CardThemeKey = keyof typeof CARD_THEMES;
