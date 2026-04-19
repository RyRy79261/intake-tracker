"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useMigrationStore } from "@/stores/migration-store";
import {
  startMigration,
  verifyMigration,
  cancelMigration,
  resumeMigration,
  completeMigration,
} from "@/lib/migration-service";
import { BackupGateStep } from "./backup-gate-step";
import { UploadProgressStep } from "./upload-progress-step";
import { VerificationStep } from "./verification-step";
import { CompletionSummaryStep } from "./completion-summary-step";
import { CancelConfirmDialog } from "./cancel-confirm-dialog";

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
  const [verifying, setVerifying] = useState(false);
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

  useEffect(() => {
    if (phase === "verifying" && !verifying) {
      setVerifying(true);
      verifyMigration().finally(() => setVerifying(false));
    }
  }, [phase, verifying]);

  const handleProceedFromBackup = useCallback(async () => {
    useMigrationStore.getState().setPhase("uploading");
    await startMigration();
  }, []);

  const handleCancelConfirm = useCallback(async () => {
    setCancelOpen(false);
    await cancelMigration();
    onOpenChange(false);
  }, [onOpenChange]);

  const handleComplete = useCallback(async () => {
    await completeMigration();
    onOpenChange(false);
  }, [onOpenChange]);

  const isBlocking = phase === "uploading" || phase === "verifying";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v && isBlocking) return;
          onOpenChange(v);
        }}
      >
        <DialogContent
          className="max-w-lg w-full min-h-[60vh] flex flex-col [&>button]:hidden"
          onPointerDownOutside={(e) => {
            if (isBlocking) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (isBlocking) e.preventDefault();
          }}
        >
          {phase === "backup" && (
            <BackupGateStep onProceed={handleProceedFromBackup} />
          )}

          {phase === "uploading" && (
            <UploadProgressStep onCancel={() => setCancelOpen(true)} />
          )}

          {phase === "verifying" && (
            <VerificationStep
              onContinue={() =>
                useMigrationStore.getState().setPhase("complete")
              }
              verifying={verifying}
            />
          )}

          {phase === "complete" && (
            <CompletionSummaryStep
              onDone={handleComplete}
              migrationStartTime={startTimeRef.current}
            />
          )}

          {phase === "error" && (
            <div className="flex flex-col items-center gap-4 p-6 text-center">
              <h2 className="text-xl font-semibold text-destructive">
                Migration Error
              </h2>
              <p className="text-sm text-muted-foreground">{error}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    reset();
                    onOpenChange(false);
                  }}
                  className="text-sm underline text-muted-foreground"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {phase === "cancelled" && (
            <div className="flex flex-col items-center gap-4 p-6 text-center">
              <h2 className="text-xl font-semibold">Migration Cancelled</h2>
              <p className="text-sm text-muted-foreground">
                All uploaded data has been removed from the server.
              </p>
              <button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                className="text-sm underline text-muted-foreground"
              >
                Close
              </button>
            </div>
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
