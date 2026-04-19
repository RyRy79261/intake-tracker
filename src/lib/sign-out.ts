import { stopEngine, detachLifecycleListeners } from "@/lib/sync-engine";
import { useSyncStatusStore } from "@/stores/sync-status-store";

export async function handleSignOut(): Promise<void> {
  stopEngine();
  detachLifecycleListeners();
  useSyncStatusStore.setState({ lastError: null, isSyncing: false });

  try {
    await fetch("/api/auth/sign-out", { method: "POST" });
  } catch {
    // Server call failed — cookie may not be cleared, but the hard
    // redirect below will hit the middleware which re-validates.
  }

  window.location.href = "/auth";
}
