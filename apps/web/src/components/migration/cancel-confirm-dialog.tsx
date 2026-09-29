"use client";

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
import { domainColor } from "@/lib/domain-colors";
import { cn } from "@/lib/utils";
import {
  dangerClass,
  descClass,
  dlgClass,
  footClass,
  headClass,
  stripe,
  titleClass,
} from "@/components/migration/dialog-kit";

interface CancelConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function CancelConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: CancelConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        data-testid="migration-cancel-confirm"
        style={stripe(domainColor("bp"))}
        className={dlgClass}
      >
        <AlertDialogHeader className={cn(headClass, "pr-4")}>
          <AlertDialogTitle className={titleClass}>Cancel migration?</AlertDialogTitle>
          <AlertDialogDescription className={descClass}>
            This will delete all uploaded data from the server and return to
            Local mode.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className={footClass}>
          <AlertDialogCancel className="border-muted-foreground">Go Back</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={dangerClass}>
            Cancel Migration
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
