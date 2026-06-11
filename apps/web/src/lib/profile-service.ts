/**
 * CRUD for the single-user medical profile (Dexie `userProfile`, v18).
 *
 * The profile holds user-reported medical conditions. They stay on the device
 * unless the user explicitly opts in (`shareConditionsWithAI`), at which point
 * the analytics insights call includes them so the AI can frame the tracked
 * data clinically.
 *
 * The table is treated as a singleton — `getUserProfile` returns the most
 * recently updated active row — but every write goes through `writeWithSync`
 * so the profile backs up and cloud-syncs like any other record.
 */

import { db, type UserProfile } from "@/lib/db";
import { ok, err, type ServiceResult } from "@/lib/service-result";
import { generateId, getDeviceId } from "@/lib/utils";
import { writeWithSync } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

/** Maximum number of conditions a profile can hold. */
export const MAX_CONDITIONS = 20;
/** Maximum length of a single condition string. */
export const MAX_CONDITION_LENGTH = 120;

/**
 * A blank profile — the shape returned before the user has saved anything.
 * An empty `id` marks it as not-yet-persisted; `saveUserProfile` assigns a
 * real id on first write.
 */
export function emptyProfile(): UserProfile {
  const now = Date.now();
  return {
    id: "",
    conditions: [],
    shareConditionsWithAI: false,
    shareMedicationsWithAI: false,
    aiInsightsConsentAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: getDeviceId(),
  };
}

/** Normalise a raw conditions list: trim, drop blanks, dedupe, clamp count. */
export function normalizeConditions(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim().slice(0, MAX_CONDITION_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_CONDITIONS) break;
  }
  return out;
}

/**
 * Read the medical profile. Returns the most recently updated active row, or
 * a blank profile when none exists. Multiple active rows can briefly exist
 * after a concurrent multi-device first-write; newest-updated wins.
 */
export async function getUserProfile(): Promise<UserProfile> {
  const rows = await db.userProfile.toArray();
  const active = rows
    .filter((r) => r.deletedAt === null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const row = active[0];
  // Spread over emptyProfile so a row written before a field existed (e.g.
  // shareMedicationsWithAI) still has every field defined.
  return row ? { ...emptyProfile(), ...row } : emptyProfile();
}

export interface ProfileUpdates {
  conditions?: string[];
  shareConditionsWithAI?: boolean;
  shareMedicationsWithAI?: boolean;
  aiInsightsConsentAt?: number | null;
}

/** Upsert the medical profile with the supplied changes. */
export async function saveUserProfile(
  updates: ProfileUpdates,
): Promise<ServiceResult<UserProfile>> {
  try {
    const current = await getUserProfile();
    const next: UserProfile = {
      ...current,
      id: current.id || generateId(),
      ...(updates.conditions !== undefined && {
        conditions: normalizeConditions(updates.conditions),
      }),
      ...(updates.shareConditionsWithAI !== undefined && {
        shareConditionsWithAI: updates.shareConditionsWithAI,
      }),
      ...(updates.shareMedicationsWithAI !== undefined && {
        shareMedicationsWithAI: updates.shareMedicationsWithAI,
      }),
      ...(updates.aiInsightsConsentAt !== undefined && {
        aiInsightsConsentAt: updates.aiInsightsConsentAt,
      }),
      updatedAt: Date.now(),
    };
    await writeWithSync("userProfile", "upsert", async () => {
      await db.userProfile.put(next);
      return next;
    });
    schedulePush();
    return ok(next);
  } catch (e) {
    return err("Failed to save profile", e);
  }
}
