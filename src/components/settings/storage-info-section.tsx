"use client";

import { HardDrive, Cloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useStorageInfo } from "@/hooks/use-storage-info";

export function StorageInfoSection() {
  const { storageUsage, storageQuota, totalRecords } = useStorageInfo();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <HardDrive className="w-4 h-4" />
        <h3 className="font-semibold">Storage</h3>
      </div>
      <div className="space-y-3 pl-6">
        {/* Sync Status Placeholder */}
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm">Sync status</span>
          <Badge variant="secondary" className="text-xs">Local only</Badge>
        </div>

        {/* Storage Usage */}
        <div className="space-y-1">
          <p className="text-sm font-medium">Estimated usage</p>
          {storageUsage ? (
            <p className="text-sm text-muted-foreground">
              {storageUsage}{storageQuota ? ` of ${storageQuota}` : ""}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Storage info unavailable</p>
          )}
        </div>

        {/* Record Counts */}
        {totalRecords !== null && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {totalRecords.toLocaleString()} records
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
