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
  // Hide skeletons during the post-commit enter animation so the (now stale)
  // adjacent-route skeleton doesn't briefly slide across the screen as the
  // new page slides in from the opposite edge.
  const [skeletonsHidden, setSkeletonsHidden] = useState(false);
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
    const w = window.innerWidth;
    if (commitDirRef.current === "next") {
      x.set(w);
      setSkeletonsHidden(true);
      animate(x, 0, {
        type: "tween",
        ease: [0.22, 1, 0.36, 1],
        duration: ENTER_DURATION,
      }).then(() => setSkeletonsHidden(false));
    } else if (commitDirRef.current === "prev") {
      x.set(-w);
      setSkeletonsHidden(true);
      animate(x, 0, {
        type: "tween",
        ease: [0.22, 1, 0.36, 1],
        duration: ENTER_DURATION,
      }).then(() => setSkeletonsHidden(false));
    } else {
      x.set(0);
    }
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

  // Edge hint pills (icon + label) fade in as the user drags.
  const prevHintOpacity = useTransform(x, [0, 60, 140], [0, 0.65, 1]);
  const nextHintOpacity = useTransform(x, [-140, -60, 0], [1, 0.65, 0]);
  const prevHintScale = useTransform(x, [0, 140], [0.85, 1]);
  const nextHintScale = useTransform(x, [-140, 0], [1, 0.85]);

  // Skeleton overlays share the drag x but sit one viewport over so they peek
  // in naturally as the user drags toward them.
  const prevSkelX = useTransform(x, (v) => v - (width || 0));
  const nextSkelX = useTransform(x, (v) => v + (width || 0));

  return (
    <div className="relative overflow-x-hidden">
      {isTopRoute && prevRoute && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed left-3 top-1/2 z-30 -translate-y-1/2 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 shadow-lg backdrop-blur"
          style={{ opacity: prevHintOpacity, scale: prevHintScale }}
        >
          <prevRoute.icon className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium">{prevRoute.title}</span>
        </motion.div>
      )}
      {isTopRoute && nextRoute && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed right-3 top-1/2 z-30 -translate-y-1/2 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 shadow-lg backdrop-blur"
          style={{ opacity: nextHintOpacity, scale: nextHintScale }}
        >
          <span className="text-xs font-medium">{nextRoute.title}</span>
          <nextRoute.icon className="h-4 w-4 text-primary" />
        </motion.div>
      )}

      {isTopRoute && prevRoute && !skeletonsHidden && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{ x: prevSkelX }}
        >
          <PageSkeleton route={prevRoute} />
        </motion.div>
      )}
      {isTopRoute && nextRoute && !skeletonsHidden && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{ x: nextSkelX }}
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
