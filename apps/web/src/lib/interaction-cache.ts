/**
 * localStorage TTL cache for ad-hoc drug interaction lookups.
 * Keys are normalized (trimmed + lowercased) to prevent duplicates. Lookup
 * callers build keys with `interactionCacheKey` so the active-prescription set
 * is part of the key.
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

/** 32-bit FNV-1a as hex: short, stable, and dependency-free. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Cache key for a lookup: the substance plus a hash of the sorted, normalised
 * active-prescription names. The answer depends on what the user is taking,
 * so starting, stopping or renaming a prescription must miss the cache
 * rather than serve a result that lacks (or still lists) that medication.
 */
export function interactionCacheKey(
  substance: string,
  medications: string[],
): string {
  const meds = [
    ...new Set(medications.map((m) => m.trim().toLowerCase()).filter(Boolean)),
  ].sort();
  return `${substance.trim().toLowerCase()}|rx:${fnv1a(meds.join("\n"))}`;
}

/** The cached entry with its write time, or null when missing/expired. */
export function getCachedEntry<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(normalizeKey(key));
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > DEFAULT_TTL) {
      // Expired — remove and return null
      localStorage.removeItem(normalizeKey(key));
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

export function getCached<T>(key: string): T | null {
  return getCachedEntry<T>(key)?.data ?? null;
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
