"use client";

import { usePathname } from "next/navigation";
import { useSettings } from "@/hooks/use-settings";
import { useScrollHide } from "@/hooks/use-scroll-hide";
import { QuickNavFooter } from "@/components/quick-nav-footer";
import { VoiceLaunchBar } from "@/components/voice/voice-launch-bar";

/**
 * Renders the home-page floating chrome (QuickNavFooter + VoiceLaunchBar)
 * outside the SwipeNav's transformed layer. Lives in the layout so
 * `position: fixed` is honored against the viewport, not the swipe transform.
 */
export function HomeFloatingBars() {
  const pathname = usePathname();
  const settings = useSettings();
  const { isHidden, handleQuickNav } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });

  if (pathname !== "/") return null;

  const barTransitionSec = settings.barTransitionDurationMs / 1000;

  return (
    <>
      <VoiceLaunchBar
        hidden={isHidden}
        hasQuickNav={settings.showQuickNav}
        transitionDuration={barTransitionSec}
      />
      {settings.showQuickNav && (
        <QuickNavFooter
          hidden={isHidden}
          order={settings.quickNavOrder}
          transitionDuration={barTransitionSec}
          quickNavItems={settings.quickNavItems}
          onScrollTo={handleQuickNav}
        />
      )}
    </>
  );
}
