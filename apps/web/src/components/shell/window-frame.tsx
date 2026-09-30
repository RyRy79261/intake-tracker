"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { SHELL_APPS } from "@/lib/nav-routes";
import { ShellIcon } from "@/components/shell/shell-icon";
import type { Edge, Rect, Win } from "@/stores/window-store";
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

/**
 * What a free (desktop) window reports while it is dragged, resized or moved
 * from the keyboard. The layer turns these into window-store actions.
 */
export interface FreeWindowHandlers {
  /** A title-bar drag starts at this pointer position; returns the rect to move from. */
  beginDrag: (clientX: number, clientY: number) => Rect | null;
  /** Move to (x, y); the pointer position decides the snap zone. */
  drag: (x: number, y: number, clientX: number, clientY: number) => void;
  /** A resize starts; returns the rect to resize from. */
  beginResize: () => Rect | null;
  resize: (from: Rect, edge: Edge, dx: number, dy: number) => void;
  end: (kind: "move" | "resize") => void;
  /** Arrow keys: one step in a direction; `resize` with Shift. */
  nudge: (dirX: number, dirY: number, resize: boolean) => void;
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
  /** Wide-screen geometry: tiled by `layoutWindows`, or the window's own. */
  rect?: Rect | undefined;
  /** Desktop: the window can be dragged, resized and moved from the keyboard. */
  free?: FreeWindowHandlers | undefined;
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

/** A press only becomes a drag after moving this far, so a click stays a click. */
export const DRAG_SLOP_PX = 3;

/**
 * Eight grips around the frame: four edges, four corners. They straddle the
 * border, so the resize cursor shows a few pixels either side of it.
 */
const GRIPS: ReadonlyArray<{ edge: Edge; className: string }> = [
  { edge: "n", className: "inset-x-2 -top-1 h-2 cursor-ns-resize" },
  { edge: "s", className: "inset-x-2 -bottom-1 h-2 cursor-ns-resize" },
  { edge: "e", className: "inset-y-2 -right-1 w-2 cursor-ew-resize" },
  { edge: "w", className: "inset-y-2 -left-1 w-2 cursor-ew-resize" },
  { edge: "nw", className: "-left-1 -top-1 h-3 w-3 cursor-nwse-resize" },
  { edge: "ne", className: "-right-1 -top-1 h-3 w-3 cursor-nesw-resize" },
  { edge: "sw", className: "-bottom-1 -left-1 h-3 w-3 cursor-nesw-resize" },
  { edge: "se", className: "-bottom-1 -right-1 h-4 w-4 cursor-nwse-resize" },
];

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface Gesture {
  /** Pointer position the deltas are measured from. */
  sx: number;
  sy: number;
  /** The rect the gesture started from; null until a press becomes a drag. */
  from: Rect | null;
  /** The grip being pulled; null for a title-bar drag. */
  edge: Edge | null;
}

/**
 * One app window. Phone: the whole area under the sys-bar, with a 48px
 * title bar "← Home | title | n/N | ×". Wide: a panel with a 32px title bar
 * (icon, title, minimise, maximise, close), tiled, or on the desktop free:
 * dragged by its title bar, resized from its edges and corners, maximised
 * by a double-click on the title bar. Hidden windows stay mounted, so their
 * queries and form state survive; each keeps its scroll position.
 */
export function WindowFrame({
  win,
  index,
  total,
  phone,
  visible,
  focused,
  rect,
  free,
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
  const hintId = `wk-${win.id}`;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  const gesture = useRef<Gesture | null>(null);

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
  const isFree = wide && !!free;
  const style: CSSProperties = { "--c": appColor(win.app) } as CSSProperties;
  if (wide && rect) {
    style.left = rect.x;
    style.top = rect.y;
    style.width = rect.w;
    style.height = rect.h;
    style.zIndex = win.z;
  }

  // Drag and resize follow one pointer until it lets go. The element that
  // was pressed captures the pointer, so the gesture carries on over other
  // windows, embedded content and outside the browser window.
  const capture = (e: PointerEvent<HTMLElement>) => {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is best effort */
    }
  };

  const onBarPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!isFree || e.button !== 0 || gesture.current) return;
    if (e.target instanceof Element && e.target.closest("button")) return;
    capture(e);
    gesture.current = { sx: e.clientX, sy: e.clientY, from: null, edge: null };
  };

  const onGripPointerDown = (edge: Edge) => (e: PointerEvent<HTMLElement>) => {
    if (!free || e.button !== 0 || gesture.current) return;
    e.preventDefault();
    const from = free.beginResize();
    if (!from) return;
    capture(e);
    gesture.current = { sx: e.clientX, sy: e.clientY, from, edge };
  };

  const onGesturePointerMove = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || !free) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (g.edge) {
      if (g.from) free.resize(g.from, g.edge, dx, dy);
      return;
    }
    if (!g.from) {
      if (Math.abs(dx) < DRAG_SLOP_PX && Math.abs(dy) < DRAG_SLOP_PX) return;
      // The drag counts from where the pointer went down, so the window
      // does not lag by the distance it took to become a drag. (A maximised
      // or snapped window is first put back under that point.)
      g.from = free.beginDrag(g.sx, g.sy);
      if (!g.from) {
        gesture.current = null;
        return;
      }
    }
    free.drag(g.from.x + dx, g.from.y + dy, e.clientX, e.clientY);
  };

  const onGesturePointerEnd = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* already released */
    }
    if (g.from) free?.end(g.edge ? "resize" : "move");
  };

  const gestureHandlers = {
    onPointerMove: onGesturePointerMove,
    onPointerUp: onGesturePointerEnd,
    onPointerCancel: onGesturePointerEnd,
    onLostPointerCapture: onGesturePointerEnd,
  };

  const onTitleKeyDown = (e: KeyboardEvent<HTMLHeadingElement>) => {
    const dir = ARROWS[e.key];
    if (!free || !dir || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    free.nudge(dir[0], dir[1], e.shiftKey);
  };

  return (
    <section
      role="region"
      aria-labelledby={titleId}
      data-testid="window"
      data-app={win.app}
      data-wid={win.id}
      data-focused={focused}
      data-free={isFree || undefined}
      data-max={(wide && win.max) || undefined}
      data-snap={(isFree && !win.max && win.snap) || undefined}
      className={cn(
        "flex-col bg-panel text-foreground animate-in fade-in-0 duration-100 motion-reduce:animate-none",
        visible ? "flex" : "hidden",
        // `duration-100` (for the fade) also gives every property a 100ms
        // transition: a dragged window must follow the pointer at once.
        isFree && "transition-none",
        phone
          ? "absolute inset-0"
          : [
              "pointer-events-auto absolute border",
              focused
                ? "border-foreground shadow-[6px_6px_0_rgba(20,22,31,.22)] dark:shadow-[6px_6px_0_rgba(0,0,0,.5)]"
                : isFree
                  ? // Floating over Home's cards: a window behind still reads as a window.
                    "border-muted-foreground shadow-[4px_4px_0_rgba(20,22,31,.12)] dark:shadow-[4px_4px_0_rgba(0,0,0,.35)]"
                  : "border-line",
            ],
      )}
      style={style}
      onPointerDownCapture={() => {
        if (!focused) onFocus();
      }}
    >
      {/* Not a control: the title bar is the drag handle for a mouse; the
          title inside it takes the arrow keys. */}
      <header
        data-wide={wide}
        data-testid="window-titlebar"
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
          isFree && "cursor-grab touch-none select-none active:cursor-grabbing",
        )}
        onPointerDown={onBarPointerDown}
        {...gestureHandlers}
        onDoubleClick={(e) => {
          if (!isFree || (e.target instanceof Element && e.target.closest("button"))) return;
          onToggleMax();
        }}
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
        {/* The title is the window's keyboard handle on the desktop: it takes
            focus when the window opens, and the arrow keys move or resize
            the window from it (described by the hint below). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={isFree ? 0 : -1}
          aria-describedby={isFree ? hintId : undefined}
          onKeyDown={isFree ? onTitleKeyDown : undefined}
          className={cn(
            "min-w-0 flex-1 truncate font-semibold",
            phone ? "px-3 text-[0.9375rem]" : "text-[0.8125rem]",
            isFree
              ? "self-stretch leading-8 outline-none focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
              : "outline-none",
            // Muted on chrome is 4.2:1 in the day theme; keep the title AA.
            wide && !focused && "text-foreground/80",
          )}
        >
          {title}
        </h2>
        {isFree && (
          <span id={hintId} className="sr-only">
            Arrow keys move this window. Shift and the arrow keys resize it.
          </span>
        )}
        {phone && total > 1 && (
          <span className="pr-1 font-mono text-xs text-muted-foreground" aria-label={`Window ${index} of ${total}`}>
            {index}/{total}
          </span>
        )}
        {wide && (
          <span className="flex">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center"
              aria-label={`Minimise ${title}`}
              onClick={onMinimise}
            >
              <ControlGlyph kind="min" />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center"
              aria-label={`${win.max ? "Restore" : "Maximise"} ${title}`}
              onClick={onToggleMax}
            >
              <ControlGlyph kind="max" restored={win.max} />
            </button>
          </span>
        )}
        <button
          type="button"
          className={cn(
            "flex shrink-0 items-center justify-center focus-visible:outline-offset-[-4px]",
            phone ? "h-12 w-12" : "h-8 w-8",
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
      {isFree && !win.max && (
        <>
          {/* The corner mark shows where to pull; the grips do the work. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 text-muted-foreground [background:repeating-linear-gradient(135deg,transparent_0_3px,currentColor_3px_4.5px)] [clip-path:polygon(100%_0,100%_100%,0_100%)]"
          />
          {GRIPS.map((g) => (
            <div
              key={g.edge}
              aria-hidden="true"
              data-grip={g.edge}
              className={cn("absolute z-10 touch-none", g.className)}
              onPointerDown={onGripPointerDown(g.edge)}
              {...gestureHandlers}
            />
          ))}
        </>
      )}
    </section>
  );
}
