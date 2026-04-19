import { stopEngine, detachLifecycleListeners } from "@/lib/sync-engine";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import { signOut } from "@/lib/auth-client";

export async function handleSignOut(): Promise<void> {
  stopEngine();
  detachLifecycleListeners();
  useSyncStatusStore.setState({ lastError: null, isSyncing: false });

  try {
    await Promise.race([
      signOut(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000)
      ),
    ]);
  } catch {
    // Timeout or network failure — redirect anyway.
  }

  window.location.href = "/auth";
}
