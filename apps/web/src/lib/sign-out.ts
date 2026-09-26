import { stopEngine, detachLifecycleListeners } from "@/lib/sync-engine";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import { signOut } from "@/lib/auth-client";
import { suspendReminders } from "@/lib/reminder-suspension";

/**
 * Sign out of this device. On-device records, the sync op-log and cursors are
 * kept (local-first; sync-account.ts stops another account from syncing them).
 * Medication reminders are cancelled and stay off until the next sign-in
 * (audit native-android#8).
 */
export async function handleSignOut(): Promise<void> {
  stopEngine();
  detachLifecycleListeners();
  useSyncStatusStore.setState({ lastError: null, isSyncing: false });

  suspendReminders();
  try {
    // With reminders suspended this cancels every pending one and schedules
    // nothing. No-op on the web.
    const { syncMedicationNotifications } = await import(
      "@/lib/local-notifications"
    );
    await syncMedicationNotifications();
  } catch {
    // Best effort — never block sign-out on the notification plugin.
  }

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

  // Hard navigation on purpose: drops every in-memory cache of the old session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional hard reload
  window.location.href = "/auth";
}
