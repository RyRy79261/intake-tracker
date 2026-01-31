"use client";

import { useState, useEffect, useCallback } from "react";

interface ServiceWorkerState {
  isUpdateAvailable: boolean;
  isUpdating: boolean;
  registration: ServiceWorkerRegistration | null;
  isRegistered: boolean;
  registrationError: string | null;
}

// Service worker URLs to try (in order)
const SW_URLS = ["/sw.js", "/sw-fallback.js"];

export function useServiceWorker() {
  const [state, setState] = useState<ServiceWorkerState>({
    isUpdateAvailable: false,
    isUpdating: false,
    registration: null,
    isRegistered: false,
    registrationError: null,
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

  // Setup listeners for a registration
  const setupRegistrationListeners = useCallback((registration: ServiceWorkerRegistration) => {
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
  }, []);

  // Manual registration function - tries sw.js then falls back to sw-fallback.js
  const registerServiceWorker = useCallback(async (): Promise<{ success: boolean; error?: string; registration?: ServiceWorkerRegistration }> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return { success: false, error: "Service Worker not supported" };
    }

    // First check if already registered
    try {
      const existingReg = await navigator.serviceWorker.getRegistration();
      if (existingReg?.active) {
        setState((prev) => ({
          ...prev,
          registration: existingReg,
          isRegistered: true,
          registrationError: null,
        }));
        setupRegistrationListeners(existingReg);
        return { success: true, registration: existingReg };
      }
    } catch {
      // Continue to try registration
    }

    // Try each SW URL
    for (const swUrl of SW_URLS) {
      try {
        console.log(`[SW] Attempting to register: ${swUrl}`);
        const registration = await navigator.serviceWorker.register(swUrl, {
          scope: "/",
        });

        // Wait for the SW to be installing/installed/active
        await new Promise<void>((resolve, reject) => {
          if (registration.active) {
            resolve();
            return;
          }

          const worker = registration.installing || registration.waiting;
          if (!worker) {
            reject(new Error("No worker found after registration"));
            return;
          }

          const timeout = setTimeout(() => {
            reject(new Error("Timeout waiting for SW to activate"));
          }, 10000);

          worker.addEventListener("statechange", () => {
            if (worker.state === "activated" || worker.state === "installed") {
              clearTimeout(timeout);
              resolve();
            }
          });
        });

        console.log(`[SW] Successfully registered: ${swUrl}`);
        setState((prev) => ({
          ...prev,
          registration,
          isRegistered: true,
          registrationError: null,
        }));
        setupRegistrationListeners(registration);
        checkForWaitingWorker(registration);
        return { success: true, registration };
      } catch (error) {
        console.warn(`[SW] Failed to register ${swUrl}:`, error);
        // Continue to next URL
      }
    }

    const errorMsg = "Failed to register any service worker";
    setState((prev) => ({
      ...prev,
      registrationError: errorMsg,
    }));
    return { success: false, error: errorMsg };
  }, [checkForWaitingWorker, setupRegistrationListeners]);

  // Unregister all service workers
  const unregisterServiceWorker = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return false;
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      setState((prev) => ({
        ...prev,
        registration: null,
        isRegistered: false,
        isUpdateAvailable: false,
      }));
      return true;
    } catch (error) {
      console.error("[SW] Failed to unregister:", error);
      return false;
    }
  }, []);

  // Force skip waiting on any waiting service worker
  const forceSkipWaiting = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return true;
      }
      return false;
    } catch (error) {
      console.error("[SW] Failed to skip waiting:", error);
      return false;
    }
  }, []);

  useEffect(() => {
    // Only run in browser and if service workers are supported
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;
    let checkInterval: ReturnType<typeof setInterval> | null = null;

    const initSW = async () => {
      try {
        // Get the existing registration
        const reg = await navigator.serviceWorker.getRegistration();
        registration = reg ?? null;
        
        if (registration) {
          setState((prev) => ({
            ...prev,
            registration,
            isRegistered: true,
          }));
          
          // Check if there's already a waiting worker
          checkForWaitingWorker(registration);
          setupRegistrationListeners(registration);

          // Periodically check for updates (every 60 seconds)
          checkInterval = setInterval(() => {
            registration?.update().catch(console.error);
          }, 60000);

          // Also check immediately
          registration.update().catch(console.error);
        } else {
          // No existing registration - try to register
          // Only auto-register in production (next-pwa should have done this)
          console.log("[SW] No registration found, attempting manual registration...");
          await registerServiceWorker();
        }
      } catch (error) {
        console.error("Service worker initialization error:", error);
        setState((prev) => ({
          ...prev,
          registrationError: error instanceof Error ? error.message : "Unknown error",
        }));
      }
    };

    // Listen for controller change (when new SW takes over)
    const handleControllerChange = () => {
      // New service worker has taken control, reload to get fresh content
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    
    initSW();

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, [checkForWaitingWorker, setupRegistrationListeners, registerServiceWorker]);

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
    isRegistered: state.isRegistered,
    registrationError: state.registrationError,
    registration: state.registration,
    applyUpdate,
    checkForUpdates,
    dismissUpdate,
    registerServiceWorker,
    unregisterServiceWorker,
    forceSkipWaiting,
  };
}
