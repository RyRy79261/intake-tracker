"use client";

import { Button } from "@/components/ui/button";
import { Shield, Key, Lock, LockOpen } from "lucide-react";
import { usePinGate } from "@/hooks/use-pin-gate";

export function PrivacySecuritySection() {
  const {
    hasPinEnabled,
    openSetupDialog,
    openChangeDialog,
    openRemoveDialog,
    lockNow,
  } = usePinGate();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <Shield className="w-4 h-4" />
        <h3 className="font-semibold">Privacy & Security</h3>
      </div>
      <div className="space-y-3 pl-0">
        {hasPinEnabled ? (
          <>
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">PIN Protection Enabled</span>
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                History and settings are protected
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={openChangeDialog}
            >
              <Key className="w-4 h-4" />
              Change PIN
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={lockNow}
            >
              <Lock className="w-4 h-4" />
              Lock Now
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={openRemoveDialog}
            >
              <LockOpen className="w-4 h-4" />
              Remove PIN
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={openSetupDialog}
            >
              <Lock className="w-4 h-4" />
              Set Up PIN
            </Button>
            <p className="text-xs text-muted-foreground">
              Protect history and settings with a 4-digit PIN.
              You&apos;ll only need to enter it once per day.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
