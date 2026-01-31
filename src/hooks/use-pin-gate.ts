"use client";

import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from "react";
import {
  hasPinSetup,
  isUnlocked as checkIsUnlocked,
  isWithin24Hours,
  setupPin,
  unlock,
  changePin,
  removePin,
  lock,
} from "@/lib/pin-service";
import { PinDialog, type PinDialogMode } from "@/components/pin-dialog";

interface PinGateContextValue {
  /** Whether a PIN has been set up */
  hasPinEnabled: boolean;
  /** Whether the user is currently unlocked */
  isUnlocked: boolean;
  /** Request PIN entry before accessing protected content */
  requirePin: () => Promise<boolean>;
  /** Open PIN setup dialog */
  openSetupDialog: () => void;
  /** Open change PIN dialog */
  openChangeDialog: () => void;
  /** Open remove PIN dialog */
  openRemoveDialog: () => void;
  /** Lock immediately (clear session) */
  lockNow: () => void;
  /** Refresh unlock state (call after storage changes) */
  refreshState: () => void;
}

const PinGateContext = createContext<PinGateContextValue | null>(null);

interface PinGateProviderProps {
  children: ReactNode;
}

export function PinGateProvider({ children }: PinGateProviderProps) {
  const [hasPinEnabled, setHasPinEnabled] = useState(false);
  const [unlocked, setUnlocked] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<PinDialogMode>("enter");
  const [pendingResolve, setPendingResolve] = useState<((value: boolean) => void) | null>(null);

  // Check state on mount and when storage changes
  const refreshState = useCallback(() => {
    const hasPin = hasPinSetup();
    setHasPinEnabled(hasPin);
    setUnlocked(checkIsUnlocked());
  }, []);

  useEffect(() => {
    refreshState();
    
    // Listen for storage changes (in case another tab changes PIN)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "intake-tracker-pin") {
        refreshState();
      }
    };
    
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refreshState]);

  // Auto-unlock check on mount if within 24 hours
  useEffect(() => {
    if (hasPinEnabled && !unlocked && isWithin24Hours()) {
      // User was unlocked within 24h but session expired (e.g., browser restart)
      // They'll need to enter PIN again, but the 24h timer is still valid
      // This is the expected behavior - sessionStorage clears on browser close
    }
  }, [hasPinEnabled, unlocked]);

  // Request PIN entry
  const requirePin = useCallback((): Promise<boolean> => {
    // No PIN set up = always unlocked
    if (!hasPinSetup()) {
      return Promise.resolve(true);
    }
    
    // Already unlocked
    if (checkIsUnlocked()) {
      setUnlocked(true);
      return Promise.resolve(true);
    }
    
    // Need to show PIN dialog
    return new Promise((resolve) => {
      setPendingResolve(() => resolve);
      setDialogMode("enter");
      setDialogOpen(true);
    });
  }, []);

  // Dialog handlers
  const openSetupDialog = useCallback(() => {
    setDialogMode("setup");
    setDialogOpen(true);
  }, []);

  const openChangeDialog = useCallback(() => {
    setDialogMode("change");
    setDialogOpen(true);
  }, []);

  const openRemoveDialog = useCallback(() => {
    setDialogMode("remove");
    setDialogOpen(true);
  }, []);

  const lockNow = useCallback(() => {
    lock();
    setUnlocked(false);
  }, []);

  // Handle dialog submission
  const handleDialogSubmit = useCallback(async (pin: string, newPin?: string): Promise<boolean> => {
    try {
      let success = false;
      
      switch (dialogMode) {
        case "enter":
          success = await unlock(pin);
          if (success) {
            setUnlocked(true);
            pendingResolve?.(true);
            setPendingResolve(null);
            setDialogOpen(false);
          }
          break;
          
        case "setup":
          success = await setupPin(pin);
          if (success) {
            setHasPinEnabled(true);
            setUnlocked(true);
            setDialogOpen(false);
          }
          break;
          
        case "change":
          if (newPin) {
            success = await changePin(pin, newPin);
            if (success) {
              setDialogOpen(false);
            }
          }
          break;
          
        case "remove":
          success = await removePin(pin);
          if (success) {
            setHasPinEnabled(false);
            setUnlocked(true);
            setDialogOpen(false);
          }
          break;
      }
      
      return success;
    } catch (error) {
      console.error("PIN operation failed:", error);
      return false;
    }
  }, [dialogMode, pendingResolve]);

  // Handle dialog cancel
  const handleDialogCancel = useCallback(() => {
    if (pendingResolve) {
      pendingResolve(false);
      setPendingResolve(null);
    }
  }, [pendingResolve]);

  // Handle dialog close
  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open && pendingResolve) {
      pendingResolve(false);
      setPendingResolve(null);
    }
    setDialogOpen(open);
  }, [pendingResolve]);

  const contextValue: PinGateContextValue = {
    hasPinEnabled,
    isUnlocked: unlocked,
    requirePin,
    openSetupDialog,
    openChangeDialog,
    openRemoveDialog,
    lockNow,
    refreshState,
  };

  return (
    <PinGateContext.Provider value={contextValue}>
      {children}
      <PinDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        mode={dialogMode}
        onSubmit={handleDialogSubmit}
        onCancel={dialogMode === "enter" ? handleDialogCancel : undefined}
      />
    </PinGateContext.Provider>
  );
}

/**
 * Hook to access PIN gate functionality
 */
export function usePinGate(): PinGateContextValue {
  const context = useContext(PinGateContext);
  if (!context) {
    throw new Error("usePinGate must be used within a PinGateProvider");
  }
  return context;
}

/**
 * Hook that gates content behind PIN
 * Returns { isUnlocked, requirePin, showLockedUI }
 * 
 * Usage:
 * const { isUnlocked, requirePin } = usePinProtected();
 * 
 * const handleOpenSensitive = async () => {
 *   if (await requirePin()) {
 *     // User is unlocked, proceed
 *   }
 * };
 */
export function usePinProtected() {
  const { isUnlocked, requirePin, hasPinEnabled } = usePinGate();
  
  return {
    isUnlocked,
    requirePin,
    hasPinEnabled,
    /** Whether to show a lock indicator (PIN is set but not unlocked) */
    showLockedUI: hasPinEnabled && !isUnlocked,
  };
}
