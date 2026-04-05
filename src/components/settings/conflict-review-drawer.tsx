"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { useResolveConflicts, type ConflictRecord } from "@/hooks/use-backup-queries";

interface ConflictReviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictRecord[];
  onResolved: () => void;
}

function getDiffFields(
  current: Record<string, unknown>,
  backup: Record<string, unknown>
): string[] {
  const IGNORE = new Set([
    "createdAt",
    "updatedAt",
    "deletedAt",
    "deviceId",
    "timezone",
  ]);
  return Object.keys(backup).filter(
    (k) =>
      !IGNORE.has(k) &&
      JSON.stringify(current[k]) !== JSON.stringify(backup[k])
  );
}

export function ConflictReviewDrawer({
  open,
  onOpenChange,
  conflicts,
  onResolved,
}: ConflictReviewDrawerProps) {
  const [decisions, setDecisions] = useState<Map<string, boolean>>(new Map());
  const resolveMut = useResolveConflicts();

  const getKey = (c: ConflictRecord) => `${c.table}:${c.id}`;
  const isUseBackup = (c: ConflictRecord) => decisions.get(getKey(c)) ?? false;

  const handleSetAll = (useBackup: boolean) => {
    const next = new Map<string, boolean>();
    conflicts.forEach((c) => next.set(getKey(c), useBackup));
    setDecisions(next);
  };

  const handleToggle = (c: ConflictRecord, useBackup: boolean) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(getKey(c), useBackup);
      return next;
    });
  };

  const handleApply = () => {
    const resolutions = conflicts.map((c) => ({
      table: c.table,
      id: c.id,
      useBackup: isUseBackup(c),
      backupRecord: c.backup,
    }));
    resolveMut.mutate(resolutions, {
      onSuccess: () => {
        setDecisions(new Map());
        onResolved();
      },
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {conflicts.length} Conflicts Found
          </DrawerTitle>
          <DrawerDescription>
            Review each conflict and choose which version to keep.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => handleSetAll(false)}
          >
            Keep All Current
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => handleSetAll(true)}
          >
            Use All Backup
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-h-[60vh]">
          {conflicts.map((c) => {
            const diffFields = getDiffFields(c.current, c.backup);
            const displayed = diffFields.slice(0, 3);
            const remaining = diffFields.length - displayed.length;
            const useBackup = isUseBackup(c);

            return (
              <div
                key={getKey(c)}
                className="rounded-lg border p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">
                      {c.table.charAt(0).toUpperCase() + c.table.slice(1)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {c.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className={
                        !useBackup
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : ""
                      }
                      onClick={() => handleToggle(c, false)}
                    >
                      {!useBackup && <Check className="h-3 w-3 mr-1" />}
                      Keep
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={
                        useBackup
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : ""
                      }
                      onClick={() => handleToggle(c, true)}
                    >
                      {useBackup && <Check className="h-3 w-3 mr-1" />}
                      Use Backup
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Changed: {displayed.join(", ")}
                  {remaining > 0 && ` +${remaining} more`}
                </p>
              </div>
            );
          })}
        </div>

        <DrawerFooter>
          <Button
            onClick={handleApply}
            disabled={resolveMut.isPending}
          >
            {resolveMut.isPending ? "Applying..." : "Apply Decisions"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
