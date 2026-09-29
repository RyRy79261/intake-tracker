"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  HardDrive,
  Cloud,
  CloudOff,
  Upload,
  LogIn,
  CheckCircle2,
  Download,
} from "lucide-react";
import { Badge } from "@intake/ui/badge";
import { Button } from "@intake/ui/button";
import { Spinner } from "@intake/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@intake/ui/alert-dialog";
import { useStorageInfo } from "@/hooks/use-storage-info";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import { useAuth } from "@/components/auth-guard";
import { useToast } from "@intake/ui/use-toast";
import { useAccountActions } from "@/hooks/use-account-actions";
// eslint-disable-next-line no-restricted-imports
import { checkInterruptedMigration } from "@/lib/migration-service";
import { MigrationWizard } from "@/components/migration/migration-wizard";
import { DeleteDataControls } from "@/components/settings/delete-data-controls";
import { DeleteMedicationDataControl } from "@/components/settings/delete-medication-data-control";
import {
  Rule,
  SubHead,
  btnClass,
  helpClass,
  plainboxClass,
  warnboxClass,
} from "@/components/settings/settings-kit";
import { domainColor } from "@/lib/domain-colors";
import { cn } from "@/lib/utils";
import {
  descClass,
  dlgClass,
  footClass,
  headClass,
  stripe,
  titleClass,
} from "@/components/migration/dialog-kit";

function tableLabel(name: string): string {
  return name
    .replace(/Records$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase());
}

export function StorageInfoSection() {
  const router = useRouter();
  const { toast } = useToast();
  const { ready, authenticated } = useAuth();
  const { storageUsage, storageQuota, totalRecords } = useStorageInfo();
  const storageMode = useSettingsStore((s) => s.storageMode);
  const lastPushedAt = useSyncStatusStore((s) => s.lastPushedAt);
  const initialSyncComplete = useSyncStatusStore((s) => s.initialSyncComplete);
  const isOnline = useSyncStatusStore((s) => s.isOnline);
  // Ops the push loop gave up on — shown so they don't vanish silently
  // (audit sync-engine#13).
  const droppedOps = useSyncStatusStore((s) => s.droppedOps);
  const clearDroppedOps = useSyncStatusStore((s) => s.clearDroppedOps);
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
    <div className="flex flex-col gap-3">
      <SubHead icon={HardDrive} color={domainColor("sodium")}>
        Storage
      </SubHead>

      <div className="flex min-h-6 flex-wrap items-center gap-2 text-sm">
        <Cloud className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span>Sync status</span>
        {storageMode === "cloud-sync" ? (
          <Badge variant="outline" className="border-weight text-weight">
            Cloud Sync
          </Badge>
        ) : (
          <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
            Local only
          </Badge>
        )}
      </div>

      {storageMode === "cloud-sync" && (
        <div className="flex min-h-6 items-center gap-2 text-sm">
          {initialSyncComplete ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-weight" aria-hidden="true" />
              <span>Full copy of your data on this device</span>
            </>
          ) : isOnline ? (
            <>
              <Spinner className="size-4 text-sodium" />
              <span className="text-muted-foreground">Downloading your full data to this device…</span>
            </>
          ) : (
            <>
              <CloudOff className="h-4 w-4 text-sodium" aria-hidden="true" />
              <span className="text-muted-foreground">Waiting to download your data (offline)</span>
            </>
          )}
        </div>
      )}

      {droppedOps.length > 0 && (
        <div className={warnboxClass} data-testid="unsynced-records">
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-sodium" aria-hidden="true" />
            {droppedOps.length} {droppedOps.length === 1 ? "record" : "records"} couldn&apos;t sync
          </p>
          <p className="text-muted-foreground">
            The server would not accept these. They are still on this device,
            but not in the cloud. Editing a record sends it again.
          </p>
          <ul className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
            {droppedOps.map((op) => (
              <li key={`${op.tableName}:${op.recordId}:${op.droppedAt}`}>
                {tableLabel(op.tableName)} · {new Date(op.droppedAt).toLocaleString()} ·{" "}
                {op.error}
              </li>
            ))}
          </ul>
          <Button variant="outline" className={`${btnClass} self-start`} onClick={clearDroppedOps}>
            Dismiss
          </Button>
        </div>
      )}

      {storageMode === "cloud-sync" && lastPushedAt && (
        <p className={helpClass}>Last synced {new Date(lastPushedAt).toLocaleString()}</p>
      )}

      {storageMode === "cloud-sync" && (
        <div>
          <Button
            variant="outline"
            className={btnClass}
            disabled={!initialSyncComplete || !isOnline}
            onClick={() => setSwitchOpen(true)}
          >
            <Download className="h-4 w-4" />
            Switch to Local only
          </Button>
          <p className={`${helpClass} mt-1`}>
            {initialSyncComplete
              ? "Keeps a full copy on this device and deletes the cloud copy."
              : "Available once your full data has finished downloading."}
          </p>
        </div>
      )}

      {storageMode === "local" && ready && !authenticated && (
        <div className={plainboxClass}>
          <p className="text-muted-foreground">Sign in to enable cloud sync across your devices.</p>
          <Button className="self-start" onClick={() => router.push("/auth")}>
            <LogIn className="h-4 w-4" />
            Sign In
          </Button>
        </div>
      )}

      {storageMode === "local" && authenticated && hasInterrupted && (
        <Button variant="outline" className={`${btnClass} self-start`} onClick={() => openMigration(true)}>
          <Upload className="h-4 w-4" />
          Resume Migration
        </Button>
      )}

      {storageMode === "local" && authenticated && !hasInterrupted && (
        <Button variant="outline" className={`${btnClass} self-start`} onClick={() => openMigration(false)}>
          <Cloud className="h-4 w-4" />
          Switch to Cloud Sync
        </Button>
      )}

      <div>
        <p className="text-sm font-medium">Estimated usage</p>
        <p className="font-mono text-sm text-muted-foreground">
          {storageUsage
            ? `${storageUsage}${storageQuota ? ` of ${storageQuota}` : ""}`
            : "Storage info unavailable"}
        </p>
        {totalRecords !== null && (
          <p className="text-sm text-muted-foreground">{totalRecords.toLocaleString()} records</p>
        )}
      </div>

      <Rule />
      <DeleteDataControls />

      <Rule />
      <DeleteMedicationDataControl />

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
        <AlertDialogContent
          data-testid="switch-to-local-dialog"
          style={stripe(domainColor("meds"))}
          className={dlgClass}
        >
          <AlertDialogHeader className={cn(headClass, "pr-4")}>
            <AlertDialogTitle className={titleClass}>Switch to local-only?</AlertDialogTitle>
            <AlertDialogDescription className={descClass}>
              Your full dataset will be downloaded to this device, then the copy
              stored in the cloud will be permanently deleted. Your account and
              login stay active, and the data on this device is kept. You can
              re-enable cloud sync later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={footClass}>
            <AlertDialogCancel className="border-muted-foreground" disabled={switching}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleSwitchToLocal();
              }}
              disabled={!canSwitchToLocal}
            >
              {switching ? <Spinner /> : null}
              {switching ? "Switching…" : "Download & switch"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
