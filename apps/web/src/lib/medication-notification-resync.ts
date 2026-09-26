/**
 * Keeps scheduled medication reminders in step with the data.
 *
 * Reminders used to be rebuilt only on cold start, so the wizard, phase and
 * titration edits, deletes, timezone adjustments and rows pulled from another
 * device all left the old alarms in place. Instead of wiring a resync into
 * every mutation path, this observes the tables reminders are built from with
 * a Dexie liveQuery — which fires for local writes, sync-engine pulls and
 * other tabs alike — and debounces one resync per burst of changes. It also
 * resyncs when the app returns to the foreground, which rolls the native
 * reminder horizon forward.
 */
import { liveQuery, type Subscription } from "dexie";
import { db } from "@/lib/db";
import { toLocalDateKey } from "@/lib/date-utils";
import { useSettingsStore } from "@/stores/settings-store";

export const RESYNC_DEBOUNCE_MS = 1_500;

type ResyncTarget = () => Promise<void> | void;

async function resyncAll(): Promise<void> {
  const [{ syncMedicationNotifications }, { syncPushSchedule }] = await Promise.all([
    import("@/lib/local-notifications"),
    import("@/lib/push-notification-service"),
  ]);
  await Promise.allSettled([syncMedicationNotifications(), syncPushSchedule()]);
}

/**
 * Touch everything a reminder depends on. The result is irrelevant: liveQuery
 * re-runs this, and emits, whenever a row in a range it read changes.
 */
async function readReminderInputs(): Promise<object> {
  const yesterday = toLocalDateKey(Date.now() - 24 * 60 * 60 * 1000);
  await Promise.all([
    db.prescriptions.toArray(),
    db.medicationPhases.toArray(),
    db.phaseSchedules.toArray(),
    db.inventoryItems.toArray(),
    // Logging or skipping a dose suppresses its pending reminder and
    // follow-ups, so recent dose logs count too.
    db.doseLogs.where("scheduledDate").aboveOrEqual(yesterday).toArray(),
  ]);
  return {};
}

/**
 * Start observing. Returns a disposer. `target` is injectable for tests.
 */
export function installMedicationNotificationResync(
  target: ResyncTarget = resyncAll,
  debounceMs: number = RESYNC_DEBOUNCE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void Promise.resolve(target()).catch((error) =>
        console.error("[reminders] Resync failed:", error),
      );
    }, debounceMs);
  };

  // The first emission doubles as the initial sync.
  const subscription: Subscription = liveQuery(readReminderInputs).subscribe({
    next: schedule,
    error: (error) => console.error("[reminders] Observer failed:", error),
  });

  // Follow-up count/interval shape the native reminders; the reminders
  // toggle gates web push.
  const unsubscribeSettings = useSettingsStore.subscribe((state, prev) => {
    if (
      state.reminderFollowUpCount !== prev.reminderFollowUpCount ||
      state.reminderFollowUpInterval !== prev.reminderFollowUpInterval ||
      state.doseRemindersEnabled !== prev.doseRemindersEnabled
    ) {
      schedule();
    }
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") schedule();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
  }

  return () => {
    subscription.unsubscribe();
    unsubscribeSettings();
    if (timer) clearTimeout(timer);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}
