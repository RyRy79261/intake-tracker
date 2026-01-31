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

// Storage key for microphone permission state (navigator.permissions.query is unreliable on mobile)
const MIC_PERMISSION_KEY = "intake-tracker-mic-permission";

/**
 * Get stored microphone permission from localStorage
 */
function getStoredMicPermission(): PermissionState | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(MIC_PERMISSION_KEY);
    if (stored === "granted" || stored === "denied") {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

/**
 * Store microphone permission in localStorage
 */
function storeMicPermission(state: PermissionState): void {
  if (typeof window === "undefined") return;
  try {
    if (state === "granted" || state === "denied") {
      localStorage.setItem(MIC_PERMISSION_KEY, state);
    }
  } catch {
    // Ignore storage errors
  }
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
      // First check localStorage (more reliable on mobile PWAs)
      let microphoneState: PermissionState = getStoredMicPermission() || "prompt";
      
      // If not stored, try to query the permission API
      if (!getStoredMicPermission() && typeof navigator !== "undefined" && navigator.permissions) {
        try {
          const micPermission = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });
          
          // Only trust the query if it's not "prompt" (which is the default/unknown state)
          if (micPermission.state !== "prompt") {
            microphoneState = micPermission.state;
            storeMicPermission(microphoneState);
          }
          
          // Listen for permission changes
          micPermission.addEventListener("change", () => {
            const newState = micPermission.state === "prompt" ? "prompt" : micPermission.state;
            storeMicPermission(newState);
            setPermissions((prev) => ({
              ...prev,
              microphone: newState,
            }));
          });
        } catch {
          // Microphone permission query not supported (e.g., Firefox)
          // Keep using stored or "prompt" state
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

      // Store the granted state in localStorage for reliability
      storeMicPermission("granted");
      
      setPermissions((prev) => ({
        ...prev,
        microphone: "granted",
      }));

      return true;
    } catch (error) {
      // Permission denied or error
      const isDenied = error instanceof DOMException && error.name === "NotAllowedError";
      const newState: PermissionState = isDenied ? "denied" : "prompt";
      
      // Store denied state in localStorage
      if (isDenied) {
        storeMicPermission("denied");
      }
      
      setPermissions((prev) => ({
        ...prev,
        microphone: newState,
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

    // Re-check microphone permission
    // First check localStorage (most reliable)
    const storedMicPermission = getStoredMicPermission();
    if (storedMicPermission) {
      setPermissions((prev) => ({
        ...prev,
        microphone: storedMicPermission,
      }));
      return;
    }
    
    // Fall back to permissions API if no stored value
    if (typeof navigator !== "undefined" && navigator.permissions) {
      try {
        const micPermission = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        const newState = micPermission.state === "prompt" ? "prompt" : micPermission.state;
        if (newState !== "prompt") {
          storeMicPermission(newState);
        }
        setPermissions((prev) => ({
          ...prev,
          microphone: newState,
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
