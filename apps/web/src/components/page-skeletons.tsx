"use client";

import type { NavRoute } from "@/lib/nav-routes";

/**
 * Per-route layout-mimicking skeletons rendered as drag-peek previews by the
 * SwipeNav. Each tries to match the destination page's structural fingerprint
 * — same card shapes, header pattern, control rows, button heights — so the
 * preview is recognizable rather than a generic placeholder.
 *
 * Decorative only; wrapped in aria-hidden by SwipeNav.
 */

// ── Primitives ──────────────────────────────────────────────

function Block({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-muted/40 ${className}`} />;
}

function BlockSoft({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-muted/25 ${className}`} />;
}

function Pill({ className = "" }: { className?: string }) {
  return <div className={`rounded-full bg-muted/40 ${className}`} />;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card/40 p-6">{children}</div>
  );
}

/**
 * Mimics the standard intake-card header: icon-square + uppercase label on
 * the left, stat numbers on the right.
 */
function CardHeader({ statLines = 2 }: { statLines?: number }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Block className="h-9 w-9 rounded-lg" />
        <Block className="h-5 w-20" />
      </div>
      <div className="space-y-1.5 text-right">
        <Block className="h-4 w-24 ml-auto" />
        <BlockSoft className="h-3 w-14 ml-auto" />
        {statLines > 2 && <BlockSoft className="h-3 w-20 ml-auto" />}
      </div>
    </div>
  );
}

// ── Intake card skeletons ──────────────────────────────────

function LiquidsCardSkel() {
  return (
    <Card>
      <CardHeader statLines={3} />
      {/* 4-tab strip */}
      <div className="grid grid-cols-4 gap-1 rounded-md bg-muted/30 p-1 mb-4">
        <Block className="h-7" />
        <BlockSoft className="h-7" />
        <BlockSoft className="h-7" />
        <BlockSoft className="h-7" />
      </div>
      {/* Progress bar */}
      <Pill className="h-3 w-full mb-4" />
      {/* Quick-pick size row */}
      <div className="flex gap-2 mb-4">
        <Block className="h-9 flex-1" />
        <Block className="h-9 flex-1" />
        <Block className="h-9 flex-1" />
        <Block className="h-9 flex-1" />
      </div>
      {/* Big +/- row */}
      <div className="flex items-center gap-3 mb-4">
        <Pill className="h-12 w-12" />
        <BlockSoft className="h-16 flex-1 rounded-xl" />
        <Pill className="h-12 w-12" />
      </div>
      {/* Confirm */}
      <Block className="h-12 w-full" />
    </Card>
  );
}

function FoodSaltCardSkel() {
  return (
    <Card>
      <CardHeader />
      {/* AI input bar */}
      <Block className="h-10 mb-4" />
      {/* Sodium input */}
      <BlockSoft className="h-3 w-16 mb-1" />
      <Block className="h-10 mb-3" />
      {/* Submit */}
      <Block className="h-10 w-full" />
    </Card>
  );
}

function BloodPressureCardSkel() {
  return (
    <Card>
      <CardHeader />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="space-y-1.5">
          <BlockSoft className="h-3 w-20" />
          <Block className="h-12" />
        </div>
        <div className="space-y-1.5">
          <BlockSoft className="h-3 w-20" />
          <Block className="h-12" />
        </div>
      </div>
      <BlockSoft className="h-3 w-24 mb-1" />
      <div className="flex gap-2 mb-3">
        <Block className="h-11 flex-1" />
        <Block className="h-11 w-14" />
      </div>
      <BlockSoft className="h-8 w-full mb-3" />
      <Block className="h-10 w-full" />
    </Card>
  );
}

function WeightCardSkel() {
  return (
    <Card>
      <CardHeader />
      <div className="flex items-center gap-3 mb-4">
        <Pill className="h-12 w-12" />
        <BlockSoft className="h-14 flex-1 rounded-xl" />
        <Pill className="h-12 w-12" />
      </div>
      <Block className="h-10 w-full" />
    </Card>
  );
}

function QuickLogCardSkel() {
  return (
    <Card>
      <CardHeader />
      <div className="grid grid-cols-3 gap-2">
        <BlockSoft className="h-16 rounded-lg" />
        <Block className="h-16 rounded-lg" />
        <BlockSoft className="h-16 rounded-lg" />
      </div>
    </Card>
  );
}

function IntakeBody() {
  return (
    <>
      <Pill className="h-9 w-full mb-4" />
      <div className="mb-6 space-y-2">
        <BlockSoft className="h-3 w-2/3" />
        <BlockSoft className="h-3 w-1/2" />
      </div>
      <div className="space-y-4 mb-6">
        <LiquidsCardSkel />
        <FoodSaltCardSkel />
      </div>
      <div className="space-y-4 mb-6">
        <BloodPressureCardSkel />
        <WeightCardSkel />
      </div>
      <div className="space-y-4">
        <QuickLogCardSkel />
        <QuickLogCardSkel />
      </div>
    </>
  );
}

// ── Medications ────────────────────────────────────────────

function MedicationsBody() {
  return (
    <>
      {/* MedTabBar: full-width row of 5 icon+label tabs, with a 0.5px bottom
          indicator on the first one. The real bar uses -mx-4 to break out of
          the container; we mimic that by using a negative margin. */}
      <div className="-mx-4 mb-3 border-b">
        <div className="flex">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 relative"
            >
              <BlockSoft className="h-4 w-4" />
              <BlockSoft className="h-3 w-12" />
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-muted/60" />
              )}
            </div>
          ))}
        </div>
      </div>
      {/* WeekDaySelector: chevron + 7 day buttons + chevron */}
      <div className="flex items-center gap-1 mb-4">
        <Pill className="h-8 w-8" />
        <div className="flex-1 grid grid-cols-7 gap-0.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={`flex flex-col items-center py-1.5 rounded-lg ${
                i === 3 ? "bg-muted/50" : ""
              }`}
            >
              <BlockSoft className="h-2.5 w-5" />
              <Block className="h-3.5 w-5 mt-1" />
            </div>
          ))}
        </div>
        <Pill className="h-8 w-8" />
      </div>
      {/* Dose-progress summary */}
      <div className="rounded-xl border bg-card/40 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <Block className="h-4 w-24" />
          <Block className="h-4 w-12" />
        </div>
        <Pill className="h-2 w-full" />
      </div>
      {/* Time slot groups */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card/40 p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <Block className="h-5 w-16" />
            <BlockSoft className="h-7 w-16" />
          </div>
          <div className="space-y-2">
            <BlockSoft className="h-12 rounded-lg" />
            <BlockSoft className="h-12 rounded-lg" />
          </div>
        </div>
      ))}
    </>
  );
}

// ── Analytics ──────────────────────────────────────────────

function AnalyticsBody() {
  return (
    <>
      {/* Time range + export row */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex gap-1.5">
          <Block className="h-8 w-12" />
          <BlockSoft className="h-8 w-12" />
          <BlockSoft className="h-8 w-12" />
          <BlockSoft className="h-8 w-16" />
        </div>
        <Pill className="h-8 w-8" />
      </div>
      {/* 4 tab triggers */}
      <div className="grid grid-cols-4 gap-1 rounded-md bg-muted/30 p-1 mb-6">
        <Block className="h-8" />
        <BlockSoft className="h-8" />
        <BlockSoft className="h-8" />
        <BlockSoft className="h-8" />
      </div>
      {/* Chart-ish big block */}
      <div className="rounded-xl border bg-card/40 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <Block className="h-4 w-32" />
          <BlockSoft className="h-3 w-16" />
        </div>
        <BlockSoft className="h-48 rounded-md" />
      </div>
      {/* List items */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border bg-card/40 p-3 flex items-center gap-3"
          >
            <Block className="h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Block className="h-3.5 w-2/3" />
              <BlockSoft className="h-3 w-1/3" />
            </div>
            <BlockSoft className="h-3 w-10" />
          </div>
        ))}
      </div>
    </>
  );
}

// ── Settings ───────────────────────────────────────────────

function SettingsBody() {
  return (
    <>
      {/* Account card */}
      <div className="rounded-xl border bg-card/40 p-4 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Pill className="h-10 w-10" />
          <div className="flex-1 space-y-1.5">
            <Block className="h-4 w-40" />
            <BlockSoft className="h-3 w-48" />
          </div>
        </div>
        <BlockSoft className="h-9 w-full mt-3 rounded-md" />
      </div>
      {/* Accordion group rows */}
      <div className="space-y-2 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border bg-card/40 px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Block className="h-5 w-5" />
              <Block className="h-4 w-32" />
            </div>
            <BlockSoft className="h-4 w-4" />
          </div>
        ))}
      </div>
      {/* Reset + About */}
      <BlockSoft className="h-9 w-full mb-2" />
      <BlockSoft className="h-9 w-full" />
    </>
  );
}

// ── Profile ────────────────────────────────────────────────

function ProfileBody() {
  return (
    <>
      {/* Account card */}
      <div className="rounded-xl border bg-card/40 p-4 mb-6">
        <BlockSoft className="h-3 w-16 mb-3" />
        <div className="flex items-center gap-3">
          <Pill className="h-10 w-10" />
          <div className="flex-1 space-y-1.5">
            <Block className="h-4 w-40" />
            <BlockSoft className="h-3 w-28" />
          </div>
        </div>
      </div>
      {/* Medical context card */}
      <div className="rounded-xl border bg-card/40 p-4">
        <Block className="h-4 w-24 mb-3" />
        <BlockSoft className="h-3 w-full mb-1" />
        <BlockSoft className="h-3 w-2/3 mb-3" />
        <div className="flex gap-1.5 mb-4">
          <Pill className="h-6 w-20" />
          <Pill className="h-6 w-28" />
        </div>
        <Block className="h-10 w-full mb-4" />
        <div className="space-y-3 border-t pt-3">
          <BlockSoft className="h-8 w-full" />
          <BlockSoft className="h-8 w-full" />
        </div>
      </div>
    </>
  );
}

// ── Dispatcher ─────────────────────────────────────────────

export function PageSkeleton({ route }: { route: NavRoute }) {
  return (
    <div className="container mx-auto max-w-lg px-4 pb-6">
      {route.path === "/profile" && <ProfileBody />}
      {route.path === "/" && <IntakeBody />}
      {route.path === "/medications" && <MedicationsBody />}
      {route.path === "/analytics" && <AnalyticsBody />}
      {route.path === "/settings" && <SettingsBody />}
    </div>
  );
}
