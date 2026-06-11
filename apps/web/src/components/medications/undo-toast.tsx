import React from "react";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import type { ToastActionElement } from "@/components/ui/toast";

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
