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
