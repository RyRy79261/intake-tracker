/**
 * CRUD for the single-user medical profile (Dexie `userProfile`, v18).
 *
 * The profile holds user-reported medical conditions. They stay on the device
 * and are only sent off-device when the user explicitly opts in
 * (`shareConditionsWithAI`) — at which point the analytics insights call
 * includes them so the AI can frame the tracked data clinically.
 */

import { db, type UserProfile, USER_PROFILE_ID } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { getDeviceId } from "./utils";

/** Maximum number of conditions a profile can hold. */
export const MAX_CONDITIONS = 20;
/** Maximum length of a single condition string. */
export const MAX_CONDITION_LENGTH = 120;

/** A blank profile — the shape returned before the user has saved anything. */
export function emptyProfile(): UserProfile {
  const now = Date.now();
  return {
    id: USER_PROFILE_ID,
    conditions: [],
    shareConditionsWithAI: false,
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

/** Read the medical profile, falling back to a blank profile when unset. */
export async function getUserProfile(): Promise<UserProfile> {
  const existing = await db.userProfile.get(USER_PROFILE_ID);
  if (existing && existing.deletedAt === null) return existing;
  return emptyProfile();
}

/** Upsert the singleton medical profile with the supplied changes. */
export async function saveUserProfile(updates: {
  conditions?: string[];
  shareConditionsWithAI?: boolean;
}): Promise<ServiceResult<UserProfile>> {
  try {
    const current = await getUserProfile();
    const next: UserProfile = {
      ...current,
      ...(updates.conditions !== undefined && {
        conditions: normalizeConditions(updates.conditions),
      }),
      ...(updates.shareConditionsWithAI !== undefined && {
        shareConditionsWithAI: updates.shareConditionsWithAI,
      }),
      updatedAt: Date.now(),
    };
    await db.userProfile.put(next);
    return ok(next);
  } catch (e) {
    return err("Failed to save profile", e);
  }
}
