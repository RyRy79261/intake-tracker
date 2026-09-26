// @vitest-environment jsdom
/**
 * handleSignOut (audit native-android#8): stops sync, cancels scheduled
 * medication reminders and keeps them off until the next sign-in, and never
 * touches the on-device records.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const stopEngine = vi.fn();
const detachLifecycleListeners = vi.fn();
vi.mock("@/lib/sync-engine", () => ({
  stopEngine: () => stopEngine(),
  detachLifecycleListeners: () => detachLifecycleListeners(),
}));

const signOut = vi.fn(async () => ({ data: null, error: null }));
vi.mock("@/lib/auth-client", () => ({
  signOut: () => signOut(),
}));

const syncMedicationNotifications = vi.fn(async () => undefined);
vi.mock("@/lib/local-notifications", () => ({
  syncMedicationNotifications: () => syncMedicationNotifications(),
}));

import { db } from "@/lib/db";
import { handleSignOut } from "@/lib/sign-out";
import { areRemindersSuspended } from "@/lib/reminder-suspension";

beforeEach(() => {
  localStorage.clear();
  stopEngine.mockReset();
  signOut.mockClear();
  syncMedicationNotifications.mockClear();
  // jsdom can't navigate; swallow the redirect.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: "http://localhost/" },
  });
});

describe("handleSignOut", () => {
  it("stops the engine, signs out and redirects to /auth", async () => {
    await handleSignOut();
    expect(stopEngine).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe("/auth");
  });

  it("suspends and cancels medication reminders", async () => {
    await handleSignOut();
    expect(areRemindersSuspended()).toBe(true);
    // syncMedicationNotifications cancels everything pending and, while
    // suspended, schedules nothing.
    expect(syncMedicationNotifications).toHaveBeenCalledTimes(1);
  });

  it("still signs out if cancelling reminders fails", async () => {
    syncMedicationNotifications.mockRejectedValueOnce(new Error("plugin"));
    await handleSignOut();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe("/auth");
  });

  it("keeps the on-device records", async () => {
    await db.intakeRecords.add({
      id: "local-1",
      type: "water",
      amount: 250,
      timestamp: 1,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      deviceId: "d",
      timezone: "UTC",
    } as never);
    await handleSignOut();
    expect(await db.intakeRecords.count()).toBe(1);
  });
});
