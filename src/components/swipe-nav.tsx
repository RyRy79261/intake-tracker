"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  motion,
  useMotionValue,
  animate,
  type PanInfo,
} from "motion/react";
import { NAV_ROUTES } from "@/lib/nav-routes";
import { useSettingsStore } from "@/stores/settings-store";
import { PageSkeleton } from "@/components/page-skeletons";

const DIRECTION_LOCK_THRESHOLD = 8;
const RESISTANCE = 0.25;
const COMMIT_DURATION = 0.18;
const ENTER_DURATION = 0.22;

export function SwipeNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const x = useMotionValue(0);
  const [width, setWidth] = useState(0);
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
  const prevRoute =
    isTopRoute && currentIndex > 0 ? NAV_ROUTES[currentIndex - 1] ?? null : null;
  const nextRoute =
    isTopRoute && currentIndex < NAV_ROUTES.length - 1
      ? NAV_ROUTES[currentIndex + 1] ?? null
      : null;

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (prevRoute) router.prefetch(prevRoute.path);
    if (nextRoute) router.prefetch(nextRoute.path);
  }, [prevRoute, nextRoute, router]);

  useLayoutEffect(() => {
    // After a route change the destination skeleton was already centered (it
    // animated into place during commit), so the real page just takes its
    // position. No slide-in animation — that would look like the page is
    // re-entering from the edge the user just swiped from.
    x.set(0);
    commitDirRef.current = null;
    navigatingRef.current = false;
    lockRef.current = null;
    startedRef.current = false;
  }, [pathname, x]);

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

      // While a navigation commit is in flight it owns the `x` motion value
      // until the route changes. Starting another animation here (from a
      // stray gesture during a rapid swipe) would cancel the commit
      // animation, dropping its queued router.push() and leaving the
      // skeleton overlay and page content desynced.
      if (navigatingRef.current) return;

      if (!wasHorizontal) {
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

  return (
    <div className="relative overflow-x-hidden">
      {/* Skeleton overlays. They share the drag motion value `x` for the
          translateX, but the resting offset (one viewport over) is set via
          plain CSS `left`. Doing the offset via `left` instead of folding it
          into the transform avoids two problems:
            1. motion components manage `transform` internally via the `x`/`y`
               shortcuts, so setting a `transform` string via `style` is not
               reliably applied alongside `x`.
            2. useTransform(x, v => v ± width) with width as React state is
               stale until x next changes — the skeletons would sit on top of
               the children on first render. */}
      {isTopRoute && prevRoute && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 w-screen will-change-transform"
          style={{ left: "-100vw", x }}
        >
          <PageSkeleton route={prevRoute} />
        </motion.div>
      )}
      {isTopRoute && nextRoute && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 w-screen will-change-transform"
          style={{ left: "100vw", x }}
        >
          <PageSkeleton route={nextRoute} />
        </motion.div>
      )}

      <motion.div
        className="will-change-transform"
        style={{ x, touchAction: "pan-y" }}
        {...(isTopRoute
          ? {
              onPanStart: handlePanStart,
              onPan: handlePan,
              onPanEnd: handlePanEnd,
            }
          : {})}
      >
        <div className="container mx-auto max-w-lg px-4 pb-6">{children}</div>
      </motion.div>
    </div>
  );
}
