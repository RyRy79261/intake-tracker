"use client";

import { memo } from "react";
import { MODULES_BY_ID } from "@/components/shell/module-registry";
import type { ModuleId } from "@/lib/desk-modules";

/**
 * A module window's content: the module's `Body` from the registry, the same
 * card Home shows on a phone under the same `#section-…` id. The card's own
 * frame and title are dropped by CSS (`.wd-module` in ward-desktop.css); the
 * window has them. Dragging or resizing the window renders the frame on every
 * pointer move; the content does not depend on any of that.
 */
export const ModuleBody = memo(function ModuleBody({ id }: { id: ModuleId }) {
  const { Body } = MODULES_BY_ID[id];
  return (
    <div className="wd-module">
      <Body />
    </div>
  );
});
