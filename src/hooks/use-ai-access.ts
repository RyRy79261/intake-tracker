"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import type { AccessStatusBody } from "@/lib/auth-response";

export type AiAccessStatus =
  | { status: "signed-out" }
  | { status: "loading" }
  | { status: "approved"; email?: string }
  | { status: "denied"; reason?: string };

export interface AccessInputs {
  ready: boolean;
  authenticated: boolean;
  data: AccessStatusBody | undefined;
  isError?: boolean;
}

/**
 * Pure mapping from auth-state + access-probe data → UI-facing status.
 * Exported for unit tests.
 *
 * Key invariants:
 *   - `signedIn: false` from the server (token invalid / no token) collapses
 *     to "signed-out", not "denied". Re-logging in might help; "contact
 *     admin" is the wrong message.
 *   - A network/fetch error also collapses to "signed-out" — without a
 *     valid response we can't claim the user is approved, and showing
 *     "denied" would be misleading. The probe will retry on next refetch.
 *   - Only "valid token, server says not whitelisted" maps to "denied".
 */
export function interpretAccessResponse(inputs: AccessInputs): AiAccessStatus {
  if (!inputs.ready) return { status: "loading" };
  if (!inputs.authenticated) return { status: "signed-out" };
  if (inputs.isError) return { status: "signed-out" };
  if (!inputs.data) return { status: "loading" };
  if (!inputs.data.signedIn) return { status: "signed-out" };
  if (inputs.data.approved) {
    return {
      status: "approved",
      ...(inputs.data.email && { email: inputs.data.email }),
    };
  }
  return {
    status: "denied",
    ...(inputs.data.reason && { reason: inputs.data.reason }),
  };
}

/**
 * Whether the signed-in user is approved for AI / push features by the
 * server-side whitelist. Returns "loading" while checking, "approved" /
 * "denied" once known, and "signed-out" when there's no session.
 */
export function useAiAccess(): AiAccessStatus {
  const { ready, authenticated, user, getAuthHeader } = useAuth();

  // Scope the cache per-user so an "approved" result for user A doesn't
  // leak to user B if they sign in on the same device. user?.id is stable
  // across sessions; the noop auth path has user === null and never
  // enables the query, so the fallback string never actually drives a fetch.
  const userId = user?.id ?? "anonymous";

  const query = useQuery({
    queryKey: ["ai-access", userId],
    enabled: ready && authenticated,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AccessStatusBody> => {
      const headers = await getAuthHeader();
      const res = await fetch("/api/ai/access", { headers });
      if (!res.ok) throw new Error("Failed to check AI access");
      return res.json();
    },
  });

  return interpretAccessResponse({
    ready,
    authenticated,
    data: query.data,
    isError: query.isError,
  });
}
