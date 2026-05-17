"use client";

import { useAuth } from "@/hooks/use-auth";
import { useAiAccess } from "@/hooks/use-ai-access";

export { useAuth };

/**
 * Whether auth-gated features (AI buttons, push toggle) should be visible
 * in the UI. True when Privy is unconfigured (dev mode — no gate), while
 * we're still determining access (avoids a flicker on first paint), or
 * when the user is approved by the server-side whitelist. Signed-in but
 * not whitelisted hides the same UI as signed-out — being authenticated
 * doesn't mean AI is permitted.
 */
export function useAuthGate(): boolean {
  const access = useAiAccess();
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return true;
  return access.status === "loading" || access.status === "approved";
}
