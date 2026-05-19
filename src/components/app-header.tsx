"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SyncStatusBadge } from "@/components/sync/sync-status-badge";
import { AuthButton } from "@/components/auth-button";
import { NAV_ROUTES } from "@/lib/nav-routes";
import { useSettings } from "@/hooks/use-settings";
import { useScrollHide } from "@/hooks/use-scroll-hide";

const NAV_ITEMS = NAV_ROUTES;

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const settings = useSettings();
  const { isHidden } = useScrollHide({
    scrollDurationMs: settings.scrollDurationMs,
    autoHideDelayMs: settings.autoHideDelayMs,
  });
  const transitionDuration = settings.barTransitionDurationMs / 1000;

  const current = NAV_ITEMS.find((item) => item.path === pathname) ?? NAV_ITEMS[0];

  // Hide entirely on routes that aren't top-level (e.g. /auth/*, /history)
  const isTopRoute = NAV_ITEMS.some((item) => item.path === pathname);
  if (!isTopRoute) return null;

  return (
    <motion.header
      className="sticky top-0 z-40 -mx-4 px-4 py-4 mb-2 bg-gradient-to-b from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95 backdrop-blur-sm flex items-center justify-between"
      animate={{ y: isHidden ? "-100%" : 0 }}
      transition={{ duration: transitionDuration, ease: "easeInOut" }}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{current.title}</h1>
        <p className="text-sm text-muted-foreground">{current.subtitle}</p>
        <SyncStatusBadge />
      </div>
      <div className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.path === pathname;
          return (
            <Button
              key={item.path}
              variant="ghost"
              size="icon"
              className={cn(
                "shrink-0 relative transition-colors",
                isActive && "bg-primary/10 text-primary"
              )}
              onClick={() => {
                if (!isActive) router.push(item.path);
              }}
            >
              <item.icon className={cn("w-5 h-5", isActive && "text-primary")} />
              <span className="sr-only">{item.label}</span>
            </Button>
          );
        })}
        <AuthButton />
      </div>
    </motion.header>
  );
}
