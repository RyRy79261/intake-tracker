"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";

export type AiProvider = "anthropic" | "groq";

export interface KeyStatusEntry {
  configured: boolean;
  last4: string;
}

export interface KeyStatus {
  anthropic: KeyStatusEntry | null;
  groq: KeyStatusEntry | null;
}

const KEYS_QUERY_KEY = ["user", "api-keys"] as const;
const SHARES_QUERY_KEY = ["user", "api-keys", "shares"] as const;
const USAGE_QUERY_KEY = ["user", "ai-usage"] as const;

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useApiKeyStatus() {
  return useQuery<KeyStatus>({
    queryKey: KEYS_QUERY_KEY,
    queryFn: async () => asJson<KeyStatus>(await apiFetch("/api/user/api-keys")),
  });
}

export function useSetApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, key }: { provider: AiProvider; key: string }) =>
      asJson<{ configured: true; last4: string }>(
        await apiFetch("/api/user/api-keys", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, key }),
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS_QUERY_KEY });
    },
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: AiProvider) =>
      asJson<{ configured: false }>(
        await apiFetch(`/api/user/api-keys?provider=${provider}`, {
          method: "DELETE",
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: SHARES_QUERY_KEY });
    },
  });
}

export interface KeyShares {
  granted: Array<{
    granteeId: string;
    granteeEmail: string;
    provider: AiProvider;
    createdAt: string;
  }>;
  received: Array<{
    grantorEmail: string;
    provider: AiProvider;
    createdAt: string;
  }>;
}

export function useKeyShares() {
  return useQuery<KeyShares>({
    queryKey: SHARES_QUERY_KEY,
    queryFn: async () =>
      asJson<KeyShares>(await apiFetch("/api/user/api-keys/shares")),
  });
}

export function useGrantShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      granteeEmail,
      provider,
    }: {
      granteeEmail: string;
      provider: AiProvider;
    }) =>
      asJson<{ ok: true }>(
        await apiFetch("/api/user/api-keys/shares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ granteeEmail, provider }),
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SHARES_QUERY_KEY });
    },
  });
}

export function useRevokeShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      granteeId,
      provider,
    }: {
      granteeId: string;
      provider: AiProvider;
    }) =>
      asJson<{ ok: true }>(
        await apiFetch(
          `/api/user/api-keys/shares?granteeId=${encodeURIComponent(granteeId)}&provider=${provider}`,
          { method: "DELETE" },
        ),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SHARES_QUERY_KEY });
    },
  });
}

export interface AiUsage {
  windowDays: number;
  mine: {
    byProvider: Array<{
      provider: AiProvider;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreateTokens: number;
      audioSeconds: number;
    }>;
    byRoute: Array<{
      route: string;
      provider: AiProvider;
      calls: number;
      inputTokens: number;
      outputTokens: number;
    }>;
  };
  asGrantor: {
    byGrantee: Array<{
      granteeId: string;
      granteeEmail: string;
      provider: AiProvider;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      audioSeconds: number;
    }>;
  };
}

export function useAiUsage(days: number = 30) {
  return useQuery<AiUsage>({
    queryKey: [...USAGE_QUERY_KEY, days],
    queryFn: async () =>
      asJson<AiUsage>(await apiFetch(`/api/user/ai-usage?days=${days}`)),
  });
}
