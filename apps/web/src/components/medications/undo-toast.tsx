import React from "react";
import { toast } from "@intake/ui/use-toast";
import { ToastAction } from "@intake/ui/toast";
import type { ToastActionElement } from "@intake/ui/toast";

const UNDO_WINDOW_MS = 5000;

/**
 * Undo callbacks whose toast may still be on screen. Only one toast shows at
 * a time, so a newer undo toast replaces an older one; instead of dropping the
 * older action's Undo, it is carried into the newer toast until its own
 * window expires.
 */
let pending: { onUndo: () => void; expiresAt: number }[] = [];

/** Test hook: forget any carried-over undo callbacks. */
export function resetUndoToastForTests() {
  pending = [];
}

/**
 * Show a toast with an Undo button. Auto-dismisses after 5 seconds.
 *
 * This is a plain function (not a component) so it can be called
 * from event handlers outside React render.
 */
export function showUndoToast(options: {
  title: string;
  description?: string;
  onUndo: () => void;
}) {
  const now = Date.now();
  const entry = { onUndo: options.onUndo, expiresAt: now + UNDO_WINDOW_MS };
  pending = [...pending.filter((p) => p.expiresAt > now), entry];
  const batch = pending;

  const handleUndo = () => {
    // Newest first, and each callback at most once even if two toasts
    // carried it.
    for (const p of [...batch].reverse()) {
      if (!pending.includes(p)) continue;
      pending = pending.filter((q) => q !== p);
      p.onUndo();
    }
  };

  const action = (
    <ToastAction altText="Undo" onClick={handleUndo}>
      {batch.length > 1 ? `Undo ${batch.length}` : "Undo"}
    </ToastAction>
  ) as ToastActionElement;

  toast({
    title: options.title,
    description: options.description,
    duration: UNDO_WINDOW_MS,
    action,
  });
}
