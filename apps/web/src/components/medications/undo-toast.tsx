import React from "react";
import { toast } from "@intake/ui/use-toast";
import { ToastAction } from "@intake/ui/toast";
import type { ToastActionElement } from "@intake/ui/toast";

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
  const action = (
    <ToastAction altText="Undo" onClick={options.onUndo}>
      Undo
    </ToastAction>
  ) as ToastActionElement;

  toast({
    title: options.title,
    description: options.description,
    duration: 5000,
    action,
  });
}
