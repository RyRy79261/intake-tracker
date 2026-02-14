import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAmount(amount: number, unit: string): string {
  if (unit === "ml" && amount >= 1000) {
    return `${(amount / 1000).toFixed(1)}L`;
  }
  return `${amount}${unit}`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Derive a human-readable label from an IntakeRecord's `source` field.
 * Returns null for plain water ("manual") since it's the default/zero option.
 */
export function getLiquidTypeLabel(source?: string): string | null {
  if (!source || source === "manual") return null;
  if (source.startsWith("coffee:")) {
    const sub = source.split(":")[1];
    return sub ? sub.charAt(0).toUpperCase() + sub.slice(1) : "Coffee";
  }
  if (source === "juice") return "Juice";
  if (source === "food") return "Food";
  if (source.startsWith("food:")) return "Food";
  return source;
}
