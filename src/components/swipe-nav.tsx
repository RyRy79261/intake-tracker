"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from "motion/react";
import { NAV_ROUTES, type NavRoute } from "@/lib/nav-routes";
import { useSettingsStore } from "@/stores/settings-store";

const DIRECTION_LOCK_THRESHOLD = 8;
const RESISTANCE = 0.25;
const COMMIT_DURATION = 0.18;
const ENTER_DURATION = 0.22;

function PageSkeleton({ route }: { route: NavRoute | null }) {
  if (!route) {
    return <div className="w-screen shrink-0" aria-hidden="true" />;
  }
  return (
    <div className="w-screen shrink-0" aria-hidden="true">
      <div className="container mx-auto max-w-lg px-4 py-6">
        <div className="-mx-4 px-4 py-4 mb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="h-7 w-44 rounded bg-muted/70" />
              <div className="h-4 w-32 rounded bg-muted/50" />
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
              <route.icon className="h-5 w-5 text-primary/70" />
            </div>
          </div>
        </div>
        <div className="space-y-4 pt-2">
          <div className="h-28 rounded-xl bg-muted/40" />
          <div className="h-28 rounded-xl bg-muted/40" />
          <div className="h-28 rounded-xl bg-muted/40" />
          <div className="h-28 rounded-xl bg-muted/40" />
        </div>
      </div>
    </div>
  );
}

export function SwipeNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const x = useMotionValue(0);
  const [width, setWidth] = useState(0);
  const [mounted, setMounted] = useState(false);
  const lockRef = useRef<"horizontal" | "vertical" | null>(null);
  const startedRef = useRef(false);
  const navigatingRef = useRef(false);
  const commitDirRef = useRef<"prev" | "next" | null>(null);
  const distanceThresholdPct = useSettingsStore((s) => s.swipeNavDistanceThresholdPct);
  const velocityThreshold = useSettingsStore((s) => s.swipeNavVelocityThreshold);
  const distanceThresholdRef = useRef(distanceThresholdPct);
  const velocityThresholdRef = useRef(velocityThreshold);
  useEffect(() => {
    distanceThresholdRef.current = distanceThresholdPct;
  }, [distanceThresholdPct]);
  useEffect(() => {
    velocityThresholdRef.current = velocityThreshold;
  }, [velocityThreshold]);

  const currentIndex = NAV_ROUTES.findIndex((r) => r.path === pathname);
  const isTopRoute = currentIndex !== -1;
  const prevRoute: NavRoute | null =
    isTopRoute && currentIndex > 0 ? NAV_ROUTES[currentIndex - 1] ?? null : null;
  const nextRoute: NavRoute | null =
    isTopRoute && currentIndex < NAV_ROUTES.length - 1
      ? NAV_ROUTES[currentIndex + 1] ?? null
      : null;

  useLayoutEffect(() => {
    setWidth(window.innerWidth);
    setMounted(true);
  }, []);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Prefetch adjacent routes so the post-commit gap is as small as possible.
  useEffect(() => {
    if (prevRoute) router.prefetch(prevRoute.path);
    if (nextRoute) router.prefetch(nextRoute.path);
  }, [prevRoute, nextRoute, router]);

  // After a route change, snap the strip back to centered without animating —
  // the destination skeleton was already centered when we navigated, and now
  // the real children have taken its place.
  useLayoutEffect(() => {
    if (commitDirRef.current) {
      x.set(0);
      commitDirRef.current = null;
    } else {
      // Non-swipe navigation (header buttons, links): no animation needed.
      x.set(0);
    }
    navigatingRef.current = false;
    lockRef.current = null;
    startedRef.current = false;
  }, [pathname, x]);

  // Translate the strip so the *current* pane (middle of three) sits at x=0
  // when the drag value is 0. Negative drag reveals the next pane, positive
  // reveals the previous pane.
  const stripX = useTransform(x, (v) => v - (width || 0));

  const handlePanStart = useCallback(
    (event: PointerEvent, _info: PanInfo) => {
      if (!isTopRoute || navigatingRef.current) {
        lockRef.current = "vertical";
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-no-swipe]")) {
        lockRef.current = "vertical";
        return;
      }
      lockRef.current = null;
      startedRef.current = true;
    },
    [isTopRoute],
  );

  const handlePan = useCallback(
    (_event: PointerEvent, info: PanInfo) => {
      if (!startedRef.current || navigatingRef.current) return;
      if (lockRef.current === "vertical") return;

      const { offset } = info;

      if (lockRef.current === null) {
        const absX = Math.abs(offset.x);
        const absY = Math.abs(offset.y);
        if (absX < DIRECTION_LOCK_THRESHOLD && absY < DIRECTION_LOCK_THRESHOLD) return;
        if (absY > absX) {
          lockRef.current = "vertical";
          return;
        }
        lockRef.current = "horizontal";
      }

      if (lockRef.current === "horizontal") {
        let next = offset.x;
        if (next > 0 && !prevRoute) next = next * RESISTANCE;
        if (next < 0 && !nextRoute) next = next * RESISTANCE;
        x.set(next);
      }
    },
    [x, prevRoute, nextRoute],
  );

  const handlePanEnd = useCallback(
    (_event: PointerEvent, info: PanInfo) => {
      const wasHorizontal = lockRef.current === "horizontal";
      startedRef.current = false;
      lockRef.current = null;

      if (!wasHorizontal || navigatingRef.current) {
        animate(x, 0, { type: "spring", stiffness: 400, damping: 40 });
        return;
      }

      const w = window.innerWidth || width || 1;
      const threshold = w * (distanceThresholdRef.current / 100);
      const vThreshold = velocityThresholdRef.current;
      const { offset, velocity } = info;

      const goingPrev =
        offset.x > 0 && prevRoute && (offset.x > threshold || velocity.x > vThreshold);
      const goingNext =
        offset.x < 0 && nextRoute && (offset.x < -threshold || velocity.x < -vThreshold);

      if (goingPrev || goingNext) {
        navigatingRef.current = true;
        commitDirRef.current = goingPrev ? "prev" : "next";
        const target = goingPrev ? w : -w;
        const dest = goingPrev ? prevRoute! : nextRoute!;
        animate(x, target, {
          type: "tween",
          ease: [0.4, 0, 0.2, 1],
          duration: COMMIT_DURATION,
        }).then(() => {
          router.push(dest.path);
        });
      } else {
        animate(x, 0, {
          type: "tween",
          ease: [0.22, 1, 0.36, 1],
          duration: ENTER_DURATION,
        });
      }
    },
    [x, width, prevRoute, nextRoute, router],
  );

  // Non-top routes (e.g. /auth/*) and the first pre-mount render skip the
  // swipe strip and render children plainly so layout is stable and there's
  // no risk of a one-frame flash showing the previous-skeleton pane.
  if (!isTopRoute || !mounted) {
    return (
      <div className="container mx-auto max-w-lg px-4 pb-6">{children}</div>
    );
  }

  return (
    <div className="overflow-x-hidden">
      <motion.div
        className="flex will-change-transform"
        style={{ x: stripX, touchAction: "pan-y" }}
        onPanStart={handlePanStart}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
      >
        <PageSkeleton route={prevRoute} />
        <div className="w-screen shrink-0">
          <div className="container mx-auto max-w-lg px-4 pb-6">{children}</div>
        </div>
        <PageSkeleton route={nextRoute} />
      </motion.div>
    </div>
  );
}
