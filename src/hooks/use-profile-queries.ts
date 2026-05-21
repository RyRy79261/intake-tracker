"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMutation } from "@tanstack/react-query";
import {
  getUserProfile,
  saveUserProfile,
  emptyProfile,
} from "@/lib/profile-service";
import { unwrap } from "@/lib/service-result";
import type { UserProfile } from "@/lib/db";

export { MAX_CONDITIONS, MAX_CONDITION_LENGTH } from "@/lib/profile-service";

/** Live medical profile. Returns a blank profile until the query resolves. */
export function useUserProfile(): UserProfile {
  return useLiveQuery(getUserProfile, [], emptyProfile());
}

/** Mutation to upsert the medical profile. */
export function useSaveProfile() {
  return useMutation({
    mutationFn: async (updates: {
      conditions?: string[];
      shareConditionsWithAI?: boolean;
    }) => unwrap(await saveUserProfile(updates)),
  });
}
