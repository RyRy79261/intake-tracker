"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { SHELL_APPS } from "@/lib/nav-routes";
import { ShellIcon } from "@/components/shell/shell-icon";
import type { Rect, Win } from "@/stores/window-store";
import { cn } from "@/lib/utils";

/** The foreground colour, for apps without a domain colour. */
const FG = "hsl(var(--fg))";

export function appColor(app: Win["app"]): string {
  return SHELL_APPS[app].color ?? FG;
}

/**
 * The box glyphs on window controls (close, minimise, maximise): a square
 * outline with an X, a bar, or a smaller window inside. Drawn with spans so
 * they scale between the phone (22px) and wide (16px) title bars.
 */
export function ControlGlyph({ kind, restored = false }: { kind: "close" | "min" | "max"; restored?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="relative block h-[22px] w-[22px] border-[1.5px] border-current group-data-[wide=true]/tbar:h-4 group-data-[wide=true]/tbar:w-4 group-data-[wide=true]/tbar:border"
    >
      {kind === "close" && (
        <>
          <span className="absolute left-1/2 top-1/2 h-[1.5px] w-[14px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current group-data-[wide=true]/tbar:h-px group-data-[wide=true]/tbar:w-[10px]" />
          <span className="absolute left-1/2 top-1/2 h-[1.5px] w-[14px] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-current group-data-[wide=true]/tbar:h-px group-data-[wide=true]/tbar:w-[10px]" />
        </>
      )}
      {kind === "min" && <span className="absolute inset-x-[2px] bottom-[2px] h-[2px] bg-current" />}
      {kind === "max" &&
        (restored ? (
          <>
            <span className="absolute bottom-[2px] left-[4px] right-[2px] top-[4px] border border-t-2 border-current" />
            <span className="absolute left-[2px] top-[1px] h-[5px] w-[7px] border-r border-t border-current" />
          </>
        ) : (
          <span className="absolute inset-[2px] border border-t-2 border-current" />
        ))}
    </span>
  );
}

export interface WindowFrameProps {
  win: Win;
  /** 1-based position in the open windows, for the phone's "n/N". */
  index: number;
  total: number;
  /** Below 768px: full screen under the sys-bar. */
  phone: boolean;
  /** Shown on screen (the phone shows only the focused window). */
  visible: boolean;
  focused: boolean;
  /** Wide-screen geometry from `layoutWindows`. */
  rect?: Rect | undefined;
  onClose: () => void;
  /** Phone "← Home": closes this window and returns to Home. */
  onHome: () => void;
  onMinimise: () => void;
  onToggleMax: () => void;
  onFocus: () => void;
  /** Pinned over the scroll area (e.g. a FAB). */
  overlay?: ReactNode | undefined;
  /** No top padding: the body starts with its own tab bar. */
  flushTop?: boolean | undefined;
  children: ReactNode;
}

/**
 * One app window. Phone: the whole area under the sys-bar, with a 48px
 * title bar "← Home | title | n/N | ×". Wide: a tiled panel with a 32px title
 * bar (icon, title, minimise, maximise, close). Hidden windows stay mounted,
 * so their queries and form state survive; each keeps its scroll position.
 */
export function WindowFrame({
  win,
  index,
  total,
  phone,
  visible,
  focused,
  rect,
  onClose,
  onHome,
  onMinimise,
  onToggleMax,
  onFocus,
  overlay,
  flushTop = false,
  children,
}: WindowFrameProps) {
  const app = SHELL_APPS[win.app];
  const title = app.title;
  const titleId = `wt-${win.id}`;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);

  // Move focus to the title when the window opens, so screen readers
  // announce it and Tab starts inside it.
  useEffect(() => {
    if (focused) titleRef.current?.focus({ preventScroll: true });
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // display:none drops an element's scroll offset; put it back on show.
  useLayoutEffect(() => {
    if (visible && bodyRef.current) bodyRef.current.scrollTop = scrollTop.current;
  }, [visible, phone]);

  const wide = !phone;
  const style: CSSProperties = { "--c": appColor(win.app) } as CSSProperties;
  if (wide && rect) {
    style.left = rect.x;
    style.top = rect.y;
    style.width = rect.w;
    style.height = rect.h;
    style.zIndex = win.z;
  }

  return (
    <section
      role="region"
      aria-labelledby={titleId}
      data-testid="window"
      data-app={win.app}
      data-wid={win.id}
      data-focused={focused}
      className={cn(
        "flex-col bg-panel text-foreground animate-in fade-in-0 duration-100 motion-reduce:animate-none",
        visible ? "flex" : "hidden",
        phone
          ? "absolute inset-0"
          : [
              "pointer-events-auto absolute border",
              focused
                ? "border-foreground shadow-[6px_6px_0_rgba(20,22,31,.22)] dark:shadow-[6px_6px_0_rgba(0,0,0,.5)]"
                : "border-line",
            ],
      )}
      style={style}
      onPointerDownCapture={() => {
        if (!focused) onFocus();
      }}
    >
      <header
        data-wide={wide}
        className={cn(
          "group/tbar relative flex shrink-0 items-center bg-chrome",
          phone
            ? "h-12 text-foreground shadow-[inset_0_-2px_0_var(--c)]"
            : [
                "h-8 gap-2 pl-2",
                focused
                  ? "text-foreground shadow-[inset_0_-2px_0_var(--c)]"
                  : "border-b border-line text-muted-foreground",
              ],
        )}
      >
        {phone && (
          <button
            type="button"
            className="flex h-12 shrink-0 items-center gap-1.5 border-r border-current pl-2.5 pr-3.5 focus-visible:outline-offset-[-4px]"
            aria-label="Back to home"
            onClick={onHome}
          >
            <ShellIcon name="back" size={20} />
            <span className="text-xs font-semibold">Home</span>
          </button>
        )}
        {wide && (
          <span className="shrink-0 text-[color:var(--c)]" aria-hidden="true">
            <ShellIcon name={app.icon} size={16} />
          </span>
        )}
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className={cn(
            "min-w-0 flex-1 truncate font-semibold outline-none",
            phone ? "px-3 text-[0.9375rem]" : "text-[0.8125rem]",
            // Muted on chrome is 4.2:1 in the day theme; keep the title AA.
            wide && !focused && "text-foreground/80",
          )}
        >
          {title}
        </h2>
        {phone && total > 1 && (
          <span className="pr-1 font-mono text-xs text-muted-foreground" aria-label={`Window ${index} of ${total}`}>
            {index}/{total}
          </span>
        )}
        {wide && (
          <span className="flex">
            <button
              type="button"
              className="flex h-[30px] w-[30px] items-center justify-center"
              aria-label={`Minimise ${title}`}
              onClick={onMinimise}
            >
              <ControlGlyph kind="min" />
            </button>
            <button
              type="button"
              className="flex h-[30px] w-[30px] items-center justify-center"
              aria-label={`${win.max ? "Restore" : "Maximise"} ${title}`}
              onClick={onToggleMax}
            >
              <ControlGlyph kind="max" restored={win.max} />
            </button>
          </span>
        )}
        {/* -ml-2 cancels the title bar's gap-2 so Minimise, Maximise and Close sit evenly. */}
        <button
          type="button"
          className={cn(
            "flex shrink-0 items-center justify-center focus-visible:outline-offset-[-4px]",
            phone ? "h-12 w-12" : "-ml-2 mr-px h-[30px] w-[30px]",
          )}
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          <ControlGlyph kind="close" />
        </button>
      </header>
      <div
        ref={bodyRef}
        data-testid="window-body"
        className="min-h-0 flex-1 overflow-auto overscroll-contain [container-type:inline-size]"
        onScroll={(e) => {
          scrollTop.current = e.currentTarget.scrollTop;
        }}
      >
        <div className={cn("px-4 pb-6", !flushTop && "pt-3")}>{children}</div>
      </div>
      {overlay}
    </section>
  );
}
