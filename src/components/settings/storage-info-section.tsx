"use client";

import { useState, useEffect } from "react";
import { HardDrive, Cloud, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStorageInfo } from "@/hooks/use-storage-info";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";
import { checkInterruptedMigration } from "@/lib/migration-service";
import { MigrationWizard } from "@/components/migration/migration-wizard";

export function StorageInfoSection() {
  const { storageUsage, storageQuota, totalRecords } = useStorageInfo();
  const storageMode = useSettingsStore((s) => s.storageMode);
  const lastPushedAt = useSyncStatusStore((s) => s.lastPushedAt);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resumeMode, setResumeMode] = useState(false);
  const [hasInterrupted, setHasInterrupted] = useState(false);

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

        {storageMode === "cloud-sync" && lastPushedAt && (
          <p className="text-xs text-muted-foreground">
            Last synced {new Date(lastPushedAt).toLocaleString()}
          </p>
        )}

        {storageMode === "local" && hasInterrupted && (
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

        {storageMode === "local" && !hasInterrupted && (
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
      </div>

      <MigrationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        resume={resumeMode}
      />
    </div>
  );
}
