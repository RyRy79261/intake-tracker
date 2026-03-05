import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { getDeviceTimezone } from "@/lib/timezone";

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

let _deviceId: string | null = null;

export function getDeviceId(): string {
  if (_deviceId) return _deviceId;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("intake-tracker-device-id");
    if (stored) {
      _deviceId = stored;
      return stored;
    }
    const id = crypto.randomUUID();
    localStorage.setItem("intake-tracker-device-id", id);
    _deviceId = id;
    return id;
  }
  return "server";
}

export function syncFields() {
  const now = Date.now();
  return { createdAt: now, updatedAt: now, deletedAt: null as null, deviceId: getDeviceId(), timezone: getDeviceTimezone() };
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
  if (source.startsWith("juice:")) {
    const name = source.slice(6);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : "Juice";
  }
  if (source === "food") return "Food";
  if (source.startsWith("food:")) {
    const note = source.slice(5);
    return note ? `Food (${note})` : "Food";
  }
  return source;
}
