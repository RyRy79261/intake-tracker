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
}

/**
 * Pure mapping from auth-state + access-probe data → UI-facing status.
 * Exported for unit tests.
 */
export function interpretAccessResponse(inputs: AccessInputs): AiAccessStatus {
  if (!inputs.ready) return { status: "loading" };
  if (!inputs.authenticated) return { status: "signed-out" };
  if (!inputs.data) return { status: "loading" };
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
  const { ready, authenticated, getAuthHeader } = useAuth();

  const query = useQuery({
    queryKey: ["ai-access"],
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
  });
}
