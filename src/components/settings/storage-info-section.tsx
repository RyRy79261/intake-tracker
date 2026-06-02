"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Cloud, CloudOff, Upload, LogIn, CheckCircle2, Loader2, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useStorageInfo } from "@/hooks/use-storage-info";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import { useAuth } from "@/components/auth-guard";
import { useToast } from "@/hooks/use-toast";
import { useAccountActions } from "@/hooks/use-account-actions";
// eslint-disable-next-line no-restricted-imports
import { checkInterruptedMigration } from "@/lib/migration-service";
import { MigrationWizard } from "@/components/migration/migration-wizard";
import { DeleteDataControls } from "@/components/settings/delete-data-controls";

export function StorageInfoSection() {
  const router = useRouter();
  const { toast } = useToast();
  const { ready, authenticated } = useAuth();
  const { storageUsage, storageQuota, totalRecords } = useStorageInfo();
  const storageMode = useSettingsStore((s) => s.storageMode);
  const lastPushedAt = useSyncStatusStore((s) => s.lastPushedAt);
  const initialSyncComplete = useSyncStatusStore((s) => s.initialSyncComplete);
  const isOnline = useSyncStatusStore((s) => s.isOnline);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resumeMode, setResumeMode] = useState(false);
  const [hasInterrupted, setHasInterrupted] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { switchToLocalAndWipeCloud } = useAccountActions();
  const canSwitchToLocal = initialSyncComplete && isOnline && !switching;

  async function handleSwitchToLocal() {
    // Preconditions can flip after the dialog opens (e.g. going offline);
    // re-check before starting the (destructive) wipe.
    if (!initialSyncComplete || !isOnline || switching) return;
    setSwitching(true);
    try {
      await switchToLocalAndWipeCloud();
      setSwitchOpen(false);
      toast({
        title: "Switched to local-only",
        description:
          "Your data was downloaded to this device and the cloud copy was deleted.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Couldn't switch to local",
        description:
          "Your data was not changed. Check your connection and try again.",
      });
    } finally {
      setSwitching(false);
    }
  }

  useEffect(() => {
    setHasInterrupted(checkInterruptedMigration());
  }, []);

  function openMigration(resume: boolean) {
    setResumeMode(resume);
    setWizardOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <HardDrive className="w-4 h-4" />
        <h3 className="font-semibold">Storage</h3>
      </div>
      <div className="space-y-3 pl-6">
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">Sync status</span>
          {storageMode === "cloud-sync" ? (
            <Badge className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30">
              Cloud Sync
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              Local only
            </Badge>
          )}
        </div>

        {storageMode === "cloud-sync" && (
          <div className="flex items-center gap-2">
            {initialSyncComplete ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm">Full copy of your data on this device</span>
              </>
            ) : isOnline ? (
              <>
                <Loader2 className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  Downloading your full data to this device…
                </span>
              </>
            ) : (
              <>
                <CloudOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm text-muted-foreground">
                  Waiting to download your data (offline)
                </span>
              </>
            )}
          </div>
        )}

        {storageMode === "cloud-sync" && lastPushedAt && (
          <p className="text-xs text-muted-foreground">
            Last synced {new Date(lastPushedAt).toLocaleString()}
          </p>
        )}

        {storageMode === "cloud-sync" && (
          <div className="space-y-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={!initialSyncComplete || !isOnline}
              onClick={() => setSwitchOpen(true)}
            >
              <Download className="h-3 w-3" />
              Switch to Local only
            </Button>
            <p className="text-xs text-muted-foreground">
              {initialSyncComplete
                ? "Keeps a full copy on this device and deletes the cloud copy."
                : "Available once your full data has finished downloading."}
            </p>
          </div>
        )}

        {storageMode === "local" && ready && !authenticated && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Sign in to enable cloud sync across your devices.
            </p>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => router.push("/auth")}
            >
              <LogIn className="h-3 w-3" />
              Sign In
            </Button>
          </div>
        )}

        {storageMode === "local" && authenticated && hasInterrupted && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => openMigration(true)}
          >
            <Upload className="h-3 w-3" />
            Resume Migration
          </Button>
        )}

        {storageMode === "local" && authenticated && !hasInterrupted && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => openMigration(false)}
          >
            <Cloud className="h-3 w-3" />
            Switch to Cloud Sync
          </Button>
        )}

        <div className="space-y-1">
          <p className="text-sm font-medium">Estimated usage</p>
          {storageUsage ? (
            <p className="text-sm text-muted-foreground">
              {storageUsage}
              {storageQuota ? ` of ${storageQuota}` : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Storage info unavailable
            </p>
          )}
        </div>

        {totalRecords !== null && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {totalRecords.toLocaleString()} records
            </p>
          </div>
        )}

        <div className="pt-2 border-t">
          <DeleteDataControls />
        </div>
      </div>

      <MigrationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        resume={resumeMode}
      />

      <AlertDialog
        open={switchOpen}
        onOpenChange={(next) => {
          if (!switching) setSwitchOpen(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to local-only?</AlertDialogTitle>
            <AlertDialogDescription>
              Your full dataset will be downloaded to this device, then the copy
              stored in the cloud will be permanently deleted. Your account and
              login stay active, and the data on this device is kept. You can
              re-enable cloud sync later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={switching}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleSwitchToLocal();
              }}
              disabled={!canSwitchToLocal}
            >
              {switching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {switching ? "Switching…" : "Download & switch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
