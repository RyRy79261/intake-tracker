import {
  Droplets,
  Sparkles,
  Scale,
  Heart,
  Utensils,
  Droplet,
  Apple,
  CircleDot,
  Pill,
  type LucideIcon,
} from "lucide-react";

export interface CardTheme {
  label: string;
  icon: LucideIcon;
  gradient: string;
  border: string;
  iconBg: string;
  iconColor: string;
  buttonBg: string;
  outlineBorder: string;
  outlineText: string;
  progressGradient: string;
  hoverBg: string;
  inputBg: string;
  inputText: string;
  loadingBg: string;
  latestValueColor: string;
  activeToggle: string;
  sectionId: string;
}

export const CARD_THEMES = {
  water: {
    label: "Water",
    icon: Droplets,
    gradient: "from-sky-50 to-cyan-50 dark:from-sky-950/40 dark:to-cyan-950/40",
    border: "border-sky-200 dark:border-sky-800",
    iconBg: "bg-sky-100 dark:bg-sky-900/50",
    iconColor: "text-sky-600 dark:text-sky-400",
    buttonBg: "bg-sky-600 hover:bg-sky-700",
    outlineBorder: "border-sky-200 dark:border-sky-800",
    outlineText: "text-sky-700 dark:text-sky-300",
    progressGradient: "bg-gradient-to-r from-sky-400 to-cyan-500",
    hoverBg: "hover:bg-sky-100 hover:border-sky-300 dark:hover:bg-sky-900/50",
    inputBg: "bg-sky-100/80 hover:bg-sky-200/80 dark:bg-sky-900/50 dark:hover:bg-sky-800/50",
    inputText: "text-sky-700 dark:text-sky-300",
    loadingBg: "bg-sky-200 dark:bg-sky-800",
    latestValueColor: "text-sky-700 dark:text-sky-300",
    activeToggle: "bg-sky-100 border-sky-300 dark:bg-sky-900/50 dark:border-sky-700",
    sectionId: "section-water",
  },
  salt: {
    label: "Salt",
    icon: Sparkles,
    gradient: "from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40",
    border: "border-amber-200 dark:border-amber-800",
    iconBg: "bg-amber-100 dark:bg-amber-900/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    buttonBg: "bg-amber-600 hover:bg-amber-700",
    outlineBorder: "border-amber-200 dark:border-amber-800",
    outlineText: "text-amber-700 dark:text-amber-300",
    progressGradient: "bg-gradient-to-r from-amber-400 to-orange-500",
    hoverBg: "hover:bg-amber-100 hover:border-amber-300 dark:hover:bg-amber-900/50",
    inputBg: "bg-amber-100/80 hover:bg-amber-200/80 dark:bg-amber-900/50 dark:hover:bg-amber-800/50",
    inputText: "text-amber-700 dark:text-amber-300",
    loadingBg: "bg-amber-200 dark:bg-amber-800",
    latestValueColor: "text-amber-700 dark:text-amber-300",
    activeToggle: "bg-amber-100 border-amber-300 dark:bg-amber-900/50 dark:border-amber-700",
    sectionId: "section-salt",
  },
  weight: {
    label: "Weight",
    icon: Scale,
    gradient: "from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40",
    border: "border-emerald-200 dark:border-emerald-800",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    buttonBg: "bg-emerald-600 hover:bg-emerald-700",
    outlineBorder: "border-emerald-200 dark:border-emerald-800",
    outlineText: "text-emerald-700 dark:text-emerald-300",
    progressGradient: "",
    hoverBg: "hover:bg-emerald-100 hover:border-emerald-300 dark:hover:bg-emerald-900/50",
    inputBg: "",
    inputText: "",
    loadingBg: "bg-emerald-200 dark:bg-emerald-800",
    latestValueColor: "text-emerald-700 dark:text-emerald-300",
    activeToggle: "bg-emerald-100 border-emerald-300 dark:bg-emerald-900/50 dark:border-emerald-700",
    sectionId: "section-weight",
  },
  bp: {
    label: "Blood Pressure",
    icon: Heart,
    gradient: "from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/40",
    border: "border-rose-200 dark:border-rose-800",
    iconBg: "bg-rose-100 dark:bg-rose-900/50",
    iconColor: "text-rose-600 dark:text-rose-400",
    buttonBg: "bg-rose-600 hover:bg-rose-700",
    outlineBorder: "border-rose-200 dark:border-rose-800",
    outlineText: "text-rose-700 dark:text-rose-300",
    progressGradient: "",
    hoverBg: "hover:bg-rose-100 hover:border-rose-300 dark:hover:bg-rose-900/50",
    inputBg: "",
    inputText: "",
    loadingBg: "bg-rose-200 dark:bg-rose-800",
    latestValueColor: "text-rose-700 dark:text-rose-300",
    activeToggle: "bg-rose-100 border-rose-300 dark:bg-rose-900/50 dark:border-rose-700",
    sectionId: "section-bp",
  },
  eating: {
    label: "Eating",
    icon: Utensils,
    gradient: "from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40",
    border: "border-orange-200 dark:border-orange-800",
    iconBg: "bg-orange-100 dark:bg-orange-900/50",
    iconColor: "text-orange-600 dark:text-orange-400",
    buttonBg: "bg-orange-600 hover:bg-orange-700",
    outlineBorder: "border-orange-200 dark:border-orange-800",
    outlineText: "text-orange-700 dark:text-orange-300",
    progressGradient: "",
    hoverBg: "hover:bg-orange-100 hover:border-orange-300 dark:hover:bg-orange-900/50",
    inputBg: "",
    inputText: "",
    loadingBg: "bg-orange-200 dark:bg-orange-800",
    latestValueColor: "text-orange-700 dark:text-orange-300",
    activeToggle: "bg-orange-100 border-orange-300 dark:bg-orange-900/50 dark:border-orange-700",
    sectionId: "section-eating",
  },
  urination: {
    label: "Urination",
    icon: Droplet,
    gradient: "from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40",
    border: "border-violet-200 dark:border-violet-800",
    iconBg: "bg-violet-100 dark:bg-violet-900/50",
    iconColor: "text-violet-600 dark:text-violet-400",
    buttonBg: "bg-violet-600 hover:bg-violet-700",
    outlineBorder: "border-violet-200 dark:border-violet-800",
    outlineText: "text-violet-700 dark:text-violet-300",
    progressGradient: "",
    hoverBg: "hover:bg-violet-100 hover:border-violet-300 dark:hover:bg-violet-900/50",
    inputBg: "",
    inputText: "",
    loadingBg: "bg-violet-200 dark:bg-violet-800",
    latestValueColor: "text-violet-700 dark:text-violet-300",
    activeToggle: "bg-violet-100 border-violet-300 dark:bg-violet-900/50 dark:border-violet-700",
    sectionId: "section-urination",
  },
  defecation: {
    label: "Defecation",
    icon: CircleDot,
    gradient: "from-stone-50 to-amber-50 dark:from-stone-950/40 dark:to-amber-950/40",
    border: "border-stone-200 dark:border-stone-800",
    iconBg: "bg-stone-100 dark:bg-stone-900/50",
    iconColor: "text-stone-600 dark:text-stone-400",
    buttonBg: "bg-stone-600 hover:bg-stone-700",
    outlineBorder: "border-stone-200 dark:border-stone-800",
    outlineText: "text-stone-700 dark:text-stone-300",
    progressGradient: "",
    hoverBg: "hover:bg-stone-100 hover:border-stone-300 dark:hover:bg-stone-900/50",
    inputBg: "",
    inputText: "",
    loadingBg: "bg-stone-200 dark:bg-stone-800",
    latestValueColor: "text-stone-700 dark:text-stone-300",
    activeToggle: "bg-stone-100 border-stone-300 dark:bg-stone-900/50 dark:border-stone-700",
    sectionId: "section-defecation",
  },
  medications: {
    label: "Medications",
    icon: Pill,
    gradient: "from-teal-50 to-cyan-50 dark:from-teal-950/40 dark:to-cyan-950/40",
    border: "border-teal-200 dark:border-teal-800",
    iconBg: "bg-teal-100 dark:bg-teal-900/50",
    iconColor: "text-teal-600 dark:text-teal-400",
    buttonBg: "bg-teal-600 hover:bg-teal-700",
    outlineBorder: "border-teal-200 dark:border-teal-800",
    outlineText: "text-teal-700 dark:text-teal-300",
    progressGradient: "bg-gradient-to-r from-teal-400 to-cyan-500",
    hoverBg: "hover:bg-teal-100 hover:border-teal-300 dark:hover:bg-teal-900/50",
    inputBg: "bg-teal-100/80 hover:bg-teal-200/80 dark:bg-teal-900/50 dark:hover:bg-teal-800/50",
    inputText: "text-teal-700 dark:text-teal-300",
    loadingBg: "bg-teal-200 dark:bg-teal-800",
    latestValueColor: "text-teal-700 dark:text-teal-300",
    activeToggle: "bg-teal-100 border-teal-300 dark:bg-teal-900/50 dark:border-teal-700",
    sectionId: "section-medications",
  },
} as const;

/** Utility-only themes (Food Calculator, AI Input) for quick-nav-footer */
export const UTILITY_THEMES = {
  food: {
    label: "Food",
    icon: Apple,
    iconBg: "bg-green-100 dark:bg-green-900/50",
    iconColor: "text-green-600 dark:text-green-400",
  },
  ai: {
    label: "AI",
    icon: Sparkles,
    iconBg: "bg-violet-100 dark:bg-violet-900/50",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
} as const;

export type CardThemeKey = keyof typeof CARD_THEMES;
export type UtilityThemeKey = keyof typeof UTILITY_THEMES;
