/**
 * Medication reminders are suspended between sign-out and the next sign-in
 * (audit native-android#8).
 *
 * Sign-out keeps the on-device data (local-first), and the app reschedules
 * reminders from that data on every cold start. Without this flag, reminders
 * cancelled at sign-out would come straight back on the reload that follows
 * it and keep firing on a handed-on phone.
 */
const STORAGE_KEY = "intake-reminders-suspended";

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function areRemindersSuspended(): boolean {
  return storage()?.getItem(STORAGE_KEY) === "1";
}

export function suspendReminders(): void {
  storage()?.setItem(STORAGE_KEY, "1");
}

/**
 * Lift the suspension after a sign-in. Returns true if reminders were
 * suspended (the caller should reschedule them).
 */
export function resumeReminders(): boolean {
  if (!areRemindersSuspended()) return false;
  storage()?.removeItem(STORAGE_KEY);
  return true;
}
