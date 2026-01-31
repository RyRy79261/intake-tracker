"use client";

import { useState, useEffect, useCallback } from "react";

interface ServiceWorkerState {
  isUpdateAvailable: boolean;
  isUpdating: boolean;
  registration: ServiceWorkerRegistration | null;
}

export function useServiceWorker() {
  const [state, setState] = useState<ServiceWorkerState>({
    isUpdateAvailable: false,
    isUpdating: false,
    registration: null,
  });

  // Check for waiting service worker
  const checkForWaitingWorker = useCallback((reg: ServiceWorkerRegistration) => {
    if (reg.waiting) {
      setState((prev) => ({
        ...prev,
        isUpdateAvailable: true,
        registration: reg,
      }));
    }
  }, []);

  useEffect(() => {
    // Only run in browser and if service workers are supported
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;

    const handleStateChange = () => {
      if (registration?.waiting) {
        setState((prev) => ({
          ...prev,
          isUpdateAvailable: true,
          registration,
        }));
      }
    };

    const registerSW = async () => {
      try {
        // Get the existing registration
        const reg = await navigator.serviceWorker.getRegistration();
        registration = reg ?? null;
        
        if (registration) {
          // Check if there's already a waiting worker
          checkForWaitingWorker(registration);

          // Listen for new service workers
          registration.addEventListener("updatefound", () => {
            const newWorker = registration?.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  // New service worker is installed and waiting
                  setState((prev) => ({
                    ...prev,
                    isUpdateAvailable: true,
                    registration,
                  }));
                }
              });
            }
          });

          // Periodically check for updates (every 60 seconds)
          const checkInterval = setInterval(() => {
            registration?.update().catch(console.error);
          }, 60000);

          // Also check immediately
          registration.update().catch(console.error);

          return () => clearInterval(checkInterval);
        }
      } catch (error) {
        console.error("Service worker registration error:", error);
      }
    };

    // Listen for controller change (when new SW takes over)
    const handleControllerChange = () => {
      // New service worker has taken control, reload to get fresh content
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    
    const cleanup = registerSW();

    return () => {
      cleanup?.then((cleanupFn) => cleanupFn?.());
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, [checkForWaitingWorker]);

  // Function to apply the update
  const applyUpdate = useCallback(async () => {
    const { registration } = state;
    
    if (!registration?.waiting) {
      // No waiting worker, try to check for updates
      try {
        await registration?.update();
      } catch (error) {
        console.error("Failed to check for updates:", error);
      }
      return;
    }

    setState((prev) => ({ ...prev, isUpdating: true }));

    // Tell the waiting service worker to skip waiting and take control
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }, [state]);

  // Function to manually check for updates
  const checkForUpdates = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        
        // Check if there's a waiting worker after update
        if (registration.waiting) {
          setState((prev) => ({
            ...prev,
            isUpdateAvailable: true,
            registration,
          }));
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("Failed to check for updates:", error);
      return false;
    }
  }, []);

  // Dismiss the update notification (user can update later)
  const dismissUpdate = useCallback(() => {
    setState((prev) => ({ ...prev, isUpdateAvailable: false }));
  }, []);

  return {
    isUpdateAvailable: state.isUpdateAvailable,
    isUpdating: state.isUpdating,
    applyUpdate,
    checkForUpdates,
    dismissUpdate,
  };
}
