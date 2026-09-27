"use client";

// PROTOTYPE (throwaway): 404 OS look for the home screen, switch with ?variant=
// The floating variant switcher. Deliberately NOT in the 404 OS look (a white
// tab, black system text) so nobody mistakes it for the design. Arrow keys
// cycle unless something is being typed in. Only mounted when the prototype
// is enabled (not on the production deploy).

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { VARIANTS, type VariantKey } from "@/app/_prototype-os/variants";

function typingIn(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return !!el.closest("input, textarea, select, [contenteditable='true']");
}

export function VariantSwitcher({ current }: { current: VariantKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const i = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === current),
  );
  const v = VARIANTS[i] ?? VARIANTS[0];

  const go = useCallback(
    (step: number) => {
      const n = (i + step + VARIANTS.length) % VARIANTS.length;
      const key = VARIANTS[n]!.key;
      router.replace(key === "current" ? pathname : `${pathname}?variant=${key}`, {
        scroll: false,
      });
    },
    [i, pathname, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.defaultPrevented || typingIn(document.activeElement)) return;
      // Tabs, sliders and menus use arrows too.
      if (
        (document.activeElement as HTMLElement | null)?.closest(
          "[role=tablist], [role=menu], [role=listbox], [role=slider], [role=radiogroup], [role=dialog]",
        )
      ) {
        return;
      }
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Portalled to <body>: the page sits in the app's SwipeNav, whose
  // transform would pin a fixed element to it, under the OS desktop.
  const client = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!client) return null;

  const arrow =
    "grid size-8 place-items-center rounded-full text-xl leading-none text-black hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-black";

  // A slim tab on the right edge, a third of the way down, so it covers as
  // little of any variant as it can (they all use the bottom edge).
  return createPortal(
    <div
      role="group"
      aria-label="Prototype variant"
      data-prototype-switcher
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      className="fixed right-0 top-[38%] z-[200] flex flex-col items-center gap-0.5 rounded-l-xl border-2 border-r-0 border-black bg-white px-0.5 py-1 text-sm text-black opacity-80 shadow-lg hover:opacity-100 focus-within:opacity-100"
    >
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant" className={arrow}>
        ‹
      </button>
      <span
        aria-live="polite"
        title={`${v.name} (${i + 1}/${VARIANTS.length}, arrow keys)`}
        className="flex flex-col items-center px-0.5 text-center font-bold leading-tight"
      >
        <span>{v.key === "current" ? "Now" : v.key}</span>
        <span className="max-w-12 text-[9px] font-medium leading-tight text-black/70">
          {v.name}
        </span>
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant" className={arrow}>
        ›
      </button>
    </div>,
    document.body,
  );
}
