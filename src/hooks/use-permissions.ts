"use client";

import { useState, useEffect, useCallback } from "react";
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from "@/lib/push-notification-service";

export type PermissionState = "granted" | "denied" | "prompt" | "unavailable";

export interface PermissionsState {
  notifications: PermissionState;
  microphone: PermissionState;
}

/**
 * Hook to manage and query app permissions
 */
export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionsState>({
    notifications: "prompt",
    microphone: "prompt",
  });
  const [isLoading, setIsLoading] = useState(true);

  // Query current permissions on mount
  useEffect(() => {
    const queryPermissions = async () => {
      setIsLoading(true);

      // Check notification permission
      let notificationState: PermissionState = "unavailable";
      if (isNotificationSupported()) {
        const permission = getNotificationPermission();
        notificationState = permission === "default" ? "prompt" : permission;
      }

      // Check microphone permission
      let microphoneState: PermissionState = "unavailable";
      if (typeof navigator !== "undefined" && navigator.permissions) {
        try {
          const micPermission = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          microphoneState = micPermission.state === "prompt" ? "prompt" : micPermission.state;
          
          // Listen for permission changes
          micPermission.addEventListener("change", () => {
            setPermissions((prev) => ({
              ...prev,
              microphone: micPermission.state === "prompt" ? "prompt" : micPermission.state,
            }));
          });
        } catch {
          // Microphone permission query not supported (e.g., Firefox)
          // In this case, we'll show "prompt" as we don't know the state
          microphoneState = "prompt";
        }
      }

      setPermissions({
        notifications: notificationState,
        microphone: microphoneState,
      });
      setIsLoading(false);
    };

    queryPermissions();
  }, []);

  // Request notification permission
  const requestNotifications = useCallback(async (): Promise<boolean> => {
    if (!isNotificationSupported()) {
      return false;
    }

    const result = await requestNotificationPermission();
    const newState: PermissionState = result === "default" ? "prompt" : result;
    
    setPermissions((prev) => ({
      ...prev,
      notifications: newState,
    }));

    return result === "granted";
  }, []);

  // Request microphone permission
  const requestMicrophone = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      return false;
    }

    try {
      // Request microphone access - this triggers the permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Stop all tracks after getting permission
      stream.getTracks().forEach((track) => track.stop());

      setPermissions((prev) => ({
        ...prev,
        microphone: "granted",
      }));

      return true;
    } catch (error) {
      // Permission denied or error
      const isDenied = error instanceof DOMException && error.name === "NotAllowedError";
      
      setPermissions((prev) => ({
        ...prev,
        microphone: isDenied ? "denied" : "prompt",
      }));

      return false;
    }
  }, []);

  // Refresh permissions state
  const refreshPermissions = useCallback(async () => {
    // Re-check notification permission
    if (isNotificationSupported()) {
      const permission = getNotificationPermission();
      setPermissions((prev) => ({
        ...prev,
        notifications: permission === "default" ? "prompt" : permission,
      }));
    }

    // Re-check microphone permission if possible
    if (typeof navigator !== "undefined" && navigator.permissions) {
      try {
        const micPermission = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        setPermissions((prev) => ({
          ...prev,
          microphone: micPermission.state === "prompt" ? "prompt" : micPermission.state,
        }));
      } catch {
        // Ignore errors
      }
    }
  }, []);

  return {
    permissions,
    isLoading,
    requestNotifications,
    requestMicrophone,
    refreshPermissions,
  };
}

/**
 * Get a human-readable label for permission state
 */
export function getPermissionLabel(state: PermissionState): string {
  switch (state) {
    case "granted":
      return "Enabled";
    case "denied":
      return "Blocked";
    case "prompt":
      return "Not set";
    case "unavailable":
      return "Not available";
  }
}

/**
 * Check if permission can be requested (not denied or unavailable)
 */
export function canRequestPermission(state: PermissionState): boolean {
  return state === "prompt";
}
