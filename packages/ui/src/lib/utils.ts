import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names, resolving conflicts (later wins). The one shared
 * class helper every @intake/ui primitive depends on. App-coupled helpers
 * (formatAmount, generateId, syncFields, …) stay in apps/web/src/lib/utils.ts,
 * which re-exports `cn` from here so existing `@/lib/utils` importers are
 * unchanged.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
