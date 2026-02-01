"use client";

import { useCallback, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";

export type AuthHeaders = {
  Authorization: string;
};

/**
 * Hook that provides auth headers for API calls.
 * Returns undefined if not authenticated.
 */
export function useAuthHeaders() {
  const { authenticated, getAccessToken } = usePrivy();

  const getAuthHeaders = useCallback(async (): Promise<AuthHeaders | undefined> => {
    if (!authenticated) return undefined;
    
    try {
      const token = await getAccessToken();
      if (!token) return undefined;
      return { Authorization: `Bearer ${token}` };
    } catch {
      return undefined;
    }
  }, [authenticated, getAccessToken]);

  return {
    authenticated,
    getAuthHeaders,
  };
}

/**
 * Hook that provides a cached version of auth headers.
 * Useful for passing to query functions that need synchronous access.
 */
export function useAuthHeadersSync() {
  const { authenticated, user } = usePrivy();
  
  // Note: This is a simplified version that works with Privy's token caching
  // For most cases, use useAuthHeaders() with async getAuthHeaders()
  return useMemo(() => ({
    authenticated,
    userId: user?.id,
  }), [authenticated, user?.id]);
}
