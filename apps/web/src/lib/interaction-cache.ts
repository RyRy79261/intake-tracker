/**
 * localStorage TTL cache for ad-hoc drug interaction lookups.
 * Keys are normalized (trimmed + lowercased) to prevent duplicates.
 * All localStorage access is wrapped in try/catch for SSR safety and storage-full handling.
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_KEY_PREFIX = "interaction-cache:";
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

function normalizeKey(key: string): string {
  return CACHE_KEY_PREFIX + key.trim().toLowerCase();
}

export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(normalizeKey(key));
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > DEFAULT_TTL) {
      // Expired — remove and return null
      localStorage.removeItem(normalizeKey(key));
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(normalizeKey(key), JSON.stringify(entry));
  } catch {
    // Storage full or SSR — silently fail
  }
}

export function clearCache(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // SSR or storage error — silently fail
  }
}
