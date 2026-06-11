"use client";

import {
  sendTestNotification,
  getNotificationSettings,
  saveNotificationSettings,
} from "@/lib/push-notification-service";

/**
 * Re-export notification utility functions via hooks layer
 * so components don't need to import from services directly.
 */
export function useNotificationSettings() {
  return {
    getSettings: getNotificationSettings,
    saveSettings: saveNotificationSettings,
    sendTest: sendTestNotification,
  };
}
