"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import type { BugReportRequest, BugReportResponse } from "@/lib/bug-report";

/** Submit an assembled bug report to the server, which files a GitHub issue. */
export function useSubmitBugReport() {
  return useMutation<BugReportResponse, Error, BugReportRequest>({
    mutationFn: async (req) => {
      const res = await apiFetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const body = (await res.json().catch(() => ({}))) as
        | BugReportResponse
        | { error?: string };
      if (!res.ok) {
        const message =
          ("error" in body && body.error) || `Request failed (${res.status})`;
        throw new Error(message);
      }
      return body as BugReportResponse;
    },
  });
}
