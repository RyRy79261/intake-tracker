"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Bell, Mic } from "lucide-react";
import { PermissionBadge } from "@/components/permission-badge";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import { sendTestNotification, getNotificationSettings, saveNotificationSettings } from "@/lib/push-notification-service";

export function PermissionsSection() {
  const { permissions, requestNotifications, requestMicrophone, resetMicrophonePermission } = usePermissions();
  const { toast } = useToast();
  const [expiryNotificationsEnabled, setExpiryNotificationsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return getNotificationSettings().enabled;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
        <ShieldCheck className="w-4 h-4" />
        <h3 className="font-semibold">Permissions</h3>
      </div>
      <div className="space-y-3">
        {/* Notifications Permission */}
        <div className="flex items-center justify-between p-3 rounded-lg border">
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
              const granted = await requestNotifications();
              if (granted) {
                toast({ title: "Notifications enabled", variant: "success" });
              }
            }}
          />
        </div>

        {/* Microphone Permission */}
        <div className="flex items-center justify-between p-3 rounded-lg border">
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
              const granted = await requestMicrophone();
              if (granted) {
                toast({ title: "Microphone enabled", variant: "success" });
              }
            }}
            onReset={() => {
              resetMicrophonePermission();
              toast({ title: "Permission reset", description: "Tap Enable to request microphone access again" });
            }}
          />
        </div>

        {/* Expiry Notifications Toggle - only show if notifications are granted */}
        {permissions.notifications === "granted" && (
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div>
              <p className="text-sm font-medium">Expiry Reminders</p>
              <p className="text-xs text-muted-foreground">
                Get notified when records are about to expire
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={expiryNotificationsEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const newValue = !expiryNotificationsEnabled;
                  setExpiryNotificationsEnabled(newValue);
                  saveNotificationSettings({ enabled: newValue });
                  toast({
                    title: newValue ? "Reminders enabled" : "Reminders disabled",
                    variant: "success",
                  });
                }}
              >
                {expiryNotificationsEnabled ? "On" : "Off"}
              </Button>
              {expiryNotificationsEnabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const sent = await sendTestNotification();
                    if (sent) {
                      toast({ title: "Test notification sent", variant: "success" });
                    } else {
                      toast({ title: "Failed to send notification", variant: "destructive" });
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
