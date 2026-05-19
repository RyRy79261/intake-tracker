"use client";

import type { NavRoute } from "@/lib/nav-routes";

/**
 * Per-route layout-mimicking skeletons rendered as drag-peek previews by the
 * SwipeNav. Each tries to match the destination page's structural fingerprint
 * (tab bar, week selector, accordion list, etc) so the user gets a usable
 * preview of what they're swiping to rather than a generic placeholder.
 *
 * All decorative — wrapped in aria-hidden by the SwipeNav.
 */

const BLOCK = "bg-muted/40 rounded";
const BLOCK_SOFT = "bg-muted/30 rounded";
const CARD = "rounded-xl border bg-card/50";

function SkeletonHeader({ route }: { route: NavRoute }) {
  return (
    <div className="-mx-4 px-4 py-4 mb-2">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <div className={`h-7 w-44 ${BLOCK}`} />
          <div className={`h-4 w-32 ${BLOCK_SOFT}`} />
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
          <route.icon className="h-5 w-5 text-primary/70" />
        </div>
      </div>
    </div>
  );
}

function IntakeSkeletonBody() {
  return (
    <>
      <div className={`mb-4 h-8 w-3/4 mx-auto rounded-full ${BLOCK_SOFT}`} />
      <div className="mb-6 space-y-2">
        <div className={`h-3.5 w-2/3 ${BLOCK_SOFT}`} />
        <div className={`h-3.5 w-1/2 ${BLOCK_SOFT}`} />
      </div>
      <div className={`${CARD} mb-4 p-4 space-y-3`}>
        <div className="flex gap-1.5">
          <div className={`h-7 flex-1 ${BLOCK}`} />
          <div className={`h-7 flex-1 ${BLOCK_SOFT}`} />
          <div className={`h-7 flex-1 ${BLOCK_SOFT}`} />
        </div>
        <div className={`h-20 ${BLOCK_SOFT}`} />
      </div>
      <div className={`${CARD} mb-6 h-28`} />
      <div className="space-y-4 mb-6">
        <div className={`${CARD} h-32`} />
        <div className={`${CARD} h-24`} />
      </div>
      <div className="space-y-4">
        <div className={`${CARD} h-24`} />
        <div className={`${CARD} h-24`} />
      </div>
    </>
  );
}

function MedicationsSkeletonBody() {
  return (
    <>
      <div className={`${CARD} p-1 mb-4 flex justify-between`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-9 flex-1 mx-0.5 ${BLOCK_SOFT}`} />
        ))}
      </div>
      <div className="flex justify-between mb-6 px-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className={`h-3 w-6 ${BLOCK_SOFT}`} />
            <div className="h-10 w-10 rounded-full bg-muted/40" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className={`h-4 w-20 ${BLOCK}`} />
        <div className={`${CARD} h-20`} />
        <div className={`${CARD} h-20`} />
        <div className={`h-4 w-20 mt-4 ${BLOCK}`} />
        <div className={`${CARD} h-20`} />
        <div className={`${CARD} h-20`} />
      </div>
    </>
  );
}

function AnalyticsSkeletonBody() {
  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex gap-1.5">
          <div className={`h-8 w-12 ${BLOCK}`} />
          <div className={`h-8 w-12 ${BLOCK_SOFT}`} />
          <div className={`h-8 w-12 ${BLOCK_SOFT}`} />
          <div className={`h-8 w-12 ${BLOCK_SOFT}`} />
        </div>
        <div className={`h-8 w-8 ${BLOCK_SOFT}`} />
      </div>
      <div className={`${CARD} p-1 mb-4 flex gap-1`}>
        <div className={`h-8 flex-1 ${BLOCK}`} />
        <div className={`h-8 flex-1 ${BLOCK_SOFT}`} />
        <div className={`h-8 flex-1 ${BLOCK_SOFT}`} />
        <div className={`h-8 flex-1 ${BLOCK_SOFT}`} />
      </div>
      <div className={`${CARD} h-48 mb-4`} />
      <div className="space-y-2">
        <div className={`${CARD} h-14`} />
        <div className={`${CARD} h-14`} />
        <div className={`${CARD} h-14`} />
      </div>
    </>
  );
}

function SettingsSkeletonBody() {
  return (
    <>
      <div className={`${CARD} p-4 mb-6 flex items-center gap-3`}>
        <div className="h-10 w-10 rounded-full bg-muted/50" />
        <div className="flex-1 space-y-1.5">
          <div className={`h-4 w-32 ${BLOCK}`} />
          <div className={`h-3 w-40 ${BLOCK_SOFT}`} />
        </div>
      </div>
      <div className="space-y-2 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`${CARD} px-4 py-3 flex items-center justify-between`}
          >
            <div className="flex items-center gap-3">
              <div className={`h-5 w-5 ${BLOCK}`} />
              <div className={`h-4 w-28 ${BLOCK}`} />
            </div>
            <div className={`h-4 w-4 ${BLOCK_SOFT}`} />
          </div>
        ))}
      </div>
      <div className={`h-9 w-full ${BLOCK_SOFT}`} />
    </>
  );
}

export function PageSkeleton({ route }: { route: NavRoute }) {
  return (
    <div className="container mx-auto max-w-lg px-4 pt-2 pb-6">
      <SkeletonHeader route={route} />
      {route.path === "/" && <IntakeSkeletonBody />}
      {route.path === "/medications" && <MedicationsSkeletonBody />}
      {route.path === "/analytics" && <AnalyticsSkeletonBody />}
      {route.path === "/settings" && <SettingsSkeletonBody />}
    </div>
  );
}
