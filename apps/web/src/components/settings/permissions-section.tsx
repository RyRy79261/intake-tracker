"use client";

import { useState } from "react";
import { Button } from "@intake/ui/button";
import { ShieldCheck, Bell, Mic } from "lucide-react";
import { PermissionBadge } from "@/components/permission-badge";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@intake/ui/use-toast";
import { useNotificationSettings } from "@/hooks/use-notification-queries";
import { SubHead } from "@/components/settings/settings-kit";

export function PermissionsSection() {
  const { permissions, requestNotifications, requestMicrophone, resetMicrophonePermission } = usePermissions();
  const { toast } = useToast();
  const { getSettings, saveSettings, sendTest } = useNotificationSettings();
  const [expiryNotificationsEnabled, setExpiryNotificationsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return getSettings().enabled;
  });

  return (
    <div className="flex flex-col gap-2.5">
      <SubHead icon={ShieldCheck}>Permissions</SubHead>
      <div className="flex flex-col gap-1.5">
        {/* Notifications Permission */}
        <div className="flex min-h-14 items-center justify-between gap-3 border border-line bg-background px-2.5 py-2">
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Notifications</p>
              <p className="text-xs text-muted-foreground">For expiry reminders</p>
            </div>
          </div>
          <PermissionBadge
            state={permissions.notifications}
            onRequest={async () => {
              try {
                const granted = await requestNotifications();
                if (granted) {
                  toast({ title: "Notifications enabled", variant: "success" });
                }
              } catch (err) {
                toast({
                  title: "Notification request failed",
                  description: err instanceof Error ? err.message : "Could not request notifications",
                  variant: "destructive",
                });
              }
            }}
          />
        </div>

        {/* Microphone Permission */}
        <div className="flex min-h-14 items-center justify-between gap-3 border border-line bg-background px-2.5 py-2">
          <div className="flex items-center gap-3">
            <Mic className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Microphone</p>
              <p className="text-xs text-muted-foreground">For voice input</p>
            </div>
          </div>
          <PermissionBadge
            state={permissions.microphone}
            onRequest={async () => {
              try {
                const granted = await requestMicrophone();
                if (granted) {
                  toast({ title: "Microphone enabled", variant: "success" });
                }
              } catch (err) {
                toast({
                  title: "Microphone request failed",
                  description: err instanceof Error ? err.message : "Could not request microphone",
                  variant: "destructive",
                });
              }
            }}
            onReset={() => {
              try {
                resetMicrophonePermission();
                toast({ title: "Permission reset", description: "Tap Enable to request microphone access again" });
              } catch (err) {
                toast({
                  title: "Reset failed",
                  description: err instanceof Error ? err.message : "Could not reset microphone permission",
                  variant: "destructive",
                });
              }
            }}
          />
        </div>

        {/* Expiry Notifications Toggle - only show if notifications are granted */}
        {permissions.notifications === "granted" && (
          <div className="flex min-h-14 items-center justify-between gap-3 border border-line bg-background px-2.5 py-2">
            <div>
              <p className="text-sm font-medium">Expiry Reminders</p>
              <p className="text-xs text-muted-foreground">
                Get notified when records are about to expire
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={expiryNotificationsEnabled ? "default" : "outline"}
                className="h-9 min-w-12"
                aria-pressed={expiryNotificationsEnabled}
                onClick={() => {
                  const newValue = !expiryNotificationsEnabled;
                  setExpiryNotificationsEnabled(newValue);
                  try {
                    saveSettings({ enabled: newValue });
                    toast({
                      title: newValue ? "Reminders enabled" : "Reminders disabled",
                      variant: "success",
                    });
                  } catch (err) {
                    setExpiryNotificationsEnabled(!newValue);
                    toast({
                      title: "Failed to save setting",
                      description: err instanceof Error ? err.message : "Could not update notification settings",
                      variant: "destructive",
                    });
                  }
                }}
              >
                {expiryNotificationsEnabled ? "On" : "Off"}
              </Button>
              {expiryNotificationsEnabled && (
                <Button
                  variant="outline"
                  className="h-9"
                  onClick={async () => {
                    try {
                      const sent = await sendTest();
                      if (sent) {
                        toast({ title: "Test notification sent", variant: "success" });
                      } else {
                        toast({ title: "Failed to send notification", variant: "destructive" });
                      }
                    } catch (err) {
                      toast({
                        title: "Test notification failed",
                        description: err instanceof Error ? err.message : "Could not send test notification",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Test
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
