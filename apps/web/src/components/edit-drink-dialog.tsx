"use client";

import { useEffect, useRef, type FocusEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { DrinkEditFields } from "@/components/liquids/drink-edit-fields";
import { useDrinkEdit } from "@/hooks/use-drink-edit";
import type { IntakeRecord } from "@/lib/db";

interface EditDrinkDialogProps {
  /** The drink's water row, or `null` when closed. */
  record: IntakeRecord | null;
  onClose: () => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
}

/**
 * Edit one whole drink from the Records tab, with the same form as the
 * Liquids card. A time change moves every row of the drink.
 */
export function EditDrinkDialog({ record, onClose, onFocus }: EditDrinkDialogProps) {
  const form = useDrinkEdit();
  const { openEdit, editingRecord } = form;

  useEffect(() => {
    if (record) openEdit(record);
  }, [record, openEdit]);

  // The form closes itself on save and on cancel; tell the parent.
  const wasOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (editingRecord) wasOpenRef.current = true;
    else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      onCloseRef.current();
    }
  }, [editingRecord]);

  return (
    <Dialog
      open={record !== null && editingRecord !== null}
      onOpenChange={(open) => !open && form.closeEdit()}
    >
      <DialogContent className="sm:max-w-md" data-domain="water">
        <DialogHeader>
          <DialogTitle>Edit Drink</DialogTitle>
          <DialogDescription>Change the drink. A new time moves all of it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleEditSubmit} className="space-y-4">
          <DrinkEditFields form={form} />
          <div className="space-y-1">
            <Label htmlFor="edit-drink-timestamp" className="text-xs text-muted-foreground">Time</Label>
            <Input
              id="edit-drink-timestamp"
              type="datetime-local"
              value={form.editTimestamp}
              onChange={(e) => form.setEditTimestamp(e.target.value)}
              onFocus={onFocus}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-drink-note" className="text-xs text-muted-foreground">
              Note <span className="font-normal">(optional)</span>
            </Label>
            <Input
              id="edit-drink-note"
              value={form.editNote}
              onChange={(e) => form.setEditNote(e.target.value)}
              onFocus={onFocus}
              maxLength={200}
              className="h-8 text-sm"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={form.closeEdit}>
              Cancel
            </Button>
            <Button type="submit">Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
