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
  /** Domain-coloured text (headings, accents). */
  iconColor: string;
}

/**
 * A domain's label, icon and text accent. Buttons and other controls take the
 * colour from a `data-domain` scope on the card or dialog (domain-colors.ts).
 */
function theme(domain: Domain, meta: { label: string; icon: LucideIcon }): CardTheme {
  const c = DOMAIN_CLASSES[domain];
  return { ...meta, domain, iconColor: c.text };
}

export const CARD_THEMES = {
  water: theme("water", { label: "Water", icon: Droplets }),
  salt: theme("sodium", { label: "Sodium", icon: Sparkles }),
  sugar: theme("sugar", { label: "Sugar", icon: Candy }),
  potassium: theme("alcohol", { label: "Potassium", icon: Banana }),
  weight: theme("weight", { label: "Weight", icon: Scale }),
  bp: theme("bp", { label: "Blood Pressure", icon: Heart }),
  eating: theme("sodium", { label: "Eating", icon: Utensils }),
  urination: theme("bath", { label: "Urination", icon: Droplet }),
  defecation: theme("bath", { label: "Defecation", icon: CircleDot }),
  caffeine: theme("caffeine", { label: "Caffeine", icon: Coffee }),
  alcohol: theme("alcohol", { label: "Alcohol", icon: Wine }),
} as const satisfies Record<string, CardTheme>;

export type CardThemeKey = keyof typeof CARD_THEMES;
