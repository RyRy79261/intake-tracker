"use client";

import { useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";

export function useAiFetch() {
  return useCallback(
    async (
      input: string,
      init: RequestInit = {}
    ): Promise<Response | null> => {
      return apiFetch(input, init);
    },
    []
  );
}
