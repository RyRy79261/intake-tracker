"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export type AiAccessStatus =
  | { status: "signed-out" }
  | { status: "loading" }
  | { status: "approved"; email?: string }
  | { status: "denied"; reason?: string };

interface AccessResponse {
  signedIn: boolean;
  approved: boolean;
  email?: string;
  reason?: string;
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
    queryFn: async (): Promise<AccessResponse> => {
      const headers = await getAuthHeader();
      const res = await fetch("/api/ai/access", { headers });
      if (!res.ok) throw new Error("Failed to check AI access");
      return res.json();
    },
  });

  if (!ready) return { status: "loading" };
  if (!authenticated) return { status: "signed-out" };
  if (!query.data) return { status: "loading" };
  if (query.data.approved) {
    return {
      status: "approved",
      ...(query.data.email && { email: query.data.email }),
    };
  }
  return {
    status: "denied",
    ...(query.data.reason && { reason: query.data.reason }),
  };
}
