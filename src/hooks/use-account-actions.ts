"use client";

import {
  deleteAccount,
  switchToLocalAndWipeCloud,
} from "@/lib/account-service";

/**
 * Imperative account/storage lifecycle actions, exposed through a hook so
 * components don't import the service layer directly (enforced by the
 * no-restricted-imports lint rule). These are multi-step flows that navigate
 * away on success, so they're plain async callbacks rather than React Query
 * mutations.
 */
export function useAccountActions() {
  return { deleteAccount, switchToLocalAndWipeCloud };
}
