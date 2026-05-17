"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-guard";
import {
  useRequireAuth,
  type AuthDialogVariant,
} from "@/components/auth-required-dialog";

/**
 * Pure classifier for an auth-related error response. Exported so the
 * branching logic can be tested without React.
 *
 * - `expired`: token rejected (401 + requiresAuth). Re-auth flow.
 * - `unapproved`: token valid but user not on whitelist (403 +
 *   accountUnapproved). Re-auth would loop; surface "contact admin".
 * - `other`: any other status — pass through unchanged.
 */
export type AuthErrorKind = "expired" | "unapproved" | "other";

export function classifyAuthError(
  status: number,
  body: { requiresAuth?: unknown; accountUnapproved?: unknown } | null
): AuthErrorKind {
  if (status === 401 && body?.requiresAuth === true) return "expired";
  if (status === 403 && body?.accountUnapproved === true) return "unapproved";
  return "other";
}

/**
 * Fetch wrapper for authenticated /api/ai/* endpoints.
 *
 * - Prompts the sign-in modal if the user is not authenticated and waits
 *   for them to log in. Resolves with `null` if the user dismisses.
 * - Attaches the Privy bearer token automatically.
 * - On 401 + requiresAuth: treats the session as expired (logs out,
 *   reopens modal, retries once on successful re-login).
 * - On 403 + accountUnapproved: invalidates the cached ai-access query
 *   so the UI re-renders with the denied state, then returns the
 *   response without forcing re-auth.
 */
export function useAiFetch() {
  const { getAuthHeader } = useAuth();
  const { requireAuth, notifyExpired } = useRequireAuth();
  const queryClient = useQueryClient();

  return useCallback(
    async (
      input: RequestInfo | URL,
      init: RequestInit = {},
      variant: AuthDialogVariant = "ai"
    ): Promise<Response | null> => {
      const ok = await requireAuth(variant);
      if (!ok) return null;

      const authHeaders = await getAuthHeader();
      const baseHeaders = { ...(init.headers ?? {}), ...authHeaders };
      let res = await fetch(input, { ...init, headers: baseHeaders });

      if (res.status === 401 || res.status === 403) {
        const body = await res.clone().json().catch(() => null);
        const kind = classifyAuthError(res.status, body);

        if (kind === "expired") {
          const reauthOk = await notifyExpired();
          if (!reauthOk) return res;
          const retryHeaders = {
            ...(init.headers ?? {}),
            ...(await getAuthHeader()),
          };
          res = await fetch(input, { ...init, headers: retryHeaders });
        } else if (kind === "unapproved") {
          // Server told us the user isn't on the allow-list. Refresh the
          // cached access status so the UI re-renders without AI affordances.
          queryClient.invalidateQueries({ queryKey: ["ai-access"] });
        }
      }

      return res;
    },
    [getAuthHeader, requireAuth, notifyExpired, queryClient]
  );
}
