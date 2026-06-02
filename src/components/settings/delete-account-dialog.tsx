"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccountActions } from "@/hooks/use-account-actions";

const CONFIRM_PHRASE = "DELETE";

/**
 * Type-to-confirm dialog for permanent account deletion. On success
 * `deleteAccount` navigates away to /auth, so this component only has to handle
 * the failure path (re-enable the form + toast).
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { deleteAccount } = useAccountActions();

  const canDelete =
    confirmText.trim().toUpperCase() === CONFIRM_PHRASE && !busy;

  async function handleDelete() {
    if (!canDelete) return;
    setBusy(true);
    try {
      await deleteAccount(); // redirects to /auth on success
    } catch {
      setBusy(false);
      toast({
        variant: "destructive",
        title: "Couldn't delete account",
        description:
          "Something went wrong and your account was not fully deleted. Please try again.",
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return; // don't let the user dismiss mid-delete
        setConfirmText("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>
            This permanently deletes your account and erases all of your data
            from our servers, including your login. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The copy on <span className="font-medium">this device</span> is
            kept — the app switches to local-only mode and signs you out.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-delete">
              Type {CONFIRM_PHRASE} to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              disabled={busy}
              placeholder={CONFIRM_PHRASE}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="gap-2"
            onClick={handleDelete}
            disabled={!canDelete}
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {busy ? "Deleting…" : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
