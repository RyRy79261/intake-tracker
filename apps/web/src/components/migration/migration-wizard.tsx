"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@intake/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { domainColor } from "@/lib/domain-colors";
import { cn } from "@/lib/utils";
import { useMigrationStore } from "@/stores/migration-store";
// eslint-disable-next-line no-restricted-imports
import {
  startMigration,
  cancelMigration,
  resumeMigration,
  completeMigration,
} from "@/lib/migration-service";
import { BackupGateStep } from "@/components/migration/backup-gate-step";
import { UploadProgressStep } from "@/components/migration/upload-progress-step";
import { CompletionSummaryStep } from "@/components/migration/completion-summary-step";
import { CancelConfirmDialog } from "@/components/migration/cancel-confirm-dialog";
import {
  bodyClass,
  dlgClass,
  footClass,
  headClass,
  migClass,
  migHeadingClass,
  migTextClass,
  stripe,
  titleClass,
} from "@/components/migration/dialog-kit";

interface MigrationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resume?: boolean;
}

export function MigrationWizard({
  open,
  onOpenChange,
  resume = false,
}: MigrationWizardProps) {
  const { phase, error, reset } = useMigrationStore();
  const [cancelOpen, setCancelOpen] = useState(false);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (open) {
      startTimeRef.current = Date.now();
      if (resume) {
        reset();
        useMigrationStore.getState().setPhase("uploading");
        resumeMigration();
      } else {
        reset();
        useMigrationStore.getState().setPhase("backup");
      }
    }
  }, [open, resume, reset]);

  const handleProceedFromBackup = useCallback(async () => {
    useMigrationStore.getState().setPhase("uploading");
    await startMigration();
  }, []);

  const handleCancelConfirm = useCallback(async () => {
    setCancelOpen(false);
    // Keep the dialog open: it shows either the "cancelled" confirmation or,
    // when the server cleanup failed, the error (audit sync-engine#7).
    await cancelMigration();
  }, []);

  const handleComplete = useCallback(async () => {
    await completeMigration();
    onOpenChange(false);
  }, [onOpenChange]);

  const isBlocking = phase === "uploading";
  const color =
    phase === "complete"
      ? domainColor("weight")
      : phase === "error"
        ? domainColor("bp")
        : phase === "cancelled"
          ? "hsl(var(--foreground))"
          : domainColor("water");

  const close = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v && isBlocking) return;
          // Closing a finished migration (X, Escape, outside tap) finishes it
          // the way Done does. Otherwise the data is on the server while the
          // device stays in local mode, and the wizard reopens in resume mode
          // on the next load.
          if (!v && phase === "complete") {
            void handleComplete();
            return;
          }
          onOpenChange(v);
        }}
      >
        <DialogContent
          data-testid="migration-wizard"
          style={stripe(color)}
          // The close button is hidden while uploading: the upload can only
          // be stopped through Cancel, which asks first.
          className={cn(dlgClass, isBlocking && "[&>button]:hidden")}
          onPointerDownOutside={(e) => {
            if (isBlocking) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (isBlocking) e.preventDefault();
          }}
          aria-describedby={undefined}
        >
          <DialogHeader className={headClass}>
            <DialogTitle className={titleClass}>Cloud sync migration</DialogTitle>
          </DialogHeader>

          {phase === "backup" && (
            <BackupGateStep onProceed={handleProceedFromBackup} />
          )}

          {phase === "uploading" && (
            <UploadProgressStep onCancel={() => setCancelOpen(true)} />
          )}

          {phase === "complete" && (
            <CompletionSummaryStep
              onDone={handleComplete}
              migrationStartTime={startTimeRef.current}
            />
          )}

          {phase === "error" && (
            <>
              <div className={bodyClass}>
                <div className={migClass} role="alert">
                  <AlertTriangle aria-hidden="true" className="h-8 w-8 text-bp" />
                  <h3 className={cn(migHeadingClass, "text-bp")}>Migration Error</h3>
                  <p className={migTextClass}>{error}</p>
                </div>
              </div>
              <div className={footClass}>
                <Button variant="outline" className="border-muted-foreground" onClick={close}>
                  Close
                </Button>
              </div>
            </>
          )}

          {phase === "cancelled" && (
            <>
              <div className={bodyClass}>
                <div className={migClass}>
                  <h3 className={migHeadingClass}>Migration Cancelled</h3>
                  <p className={migTextClass}>
                    All uploaded data has been removed from the server.
                  </p>
                </div>
              </div>
              <div className={footClass}>
                <Button variant="outline" className="border-muted-foreground" onClick={close}>
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CancelConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onConfirm={handleCancelConfirm}
      />
    </>
  );
}
