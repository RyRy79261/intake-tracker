"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Droplets, Pill, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigateTo } from "@/lib/navigation";

const NAV_ITEMS = [
  { path: "/", icon: Droplets, label: "Intake", title: "Intake Tracker", subtitle: "Daily budget tracking" },
  { path: "/medications", icon: Pill, label: "Meds", title: "Medications", subtitle: "Medicine schedule & tracking" },
  { path: "/analytics", icon: BarChart3, label: "Analytics", title: "Analytics", subtitle: "Insights & record browsing" },
  { path: "/settings", icon: Settings, label: "Settings", title: "Settings", subtitle: "Configure preferences" },
] as const;

interface AppHeaderProps {
  headerHidden: boolean;
  transitionDuration?: number;
}

export function AppHeader({
  headerHidden,
  transitionDuration = 0.2,
}: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const current = NAV_ITEMS.find((item) => item.path === pathname) ?? NAV_ITEMS[0];

  return (
    <motion.header
      className="sticky top-0 z-40 -mx-4 px-4 py-4 mb-2 bg-gradient-to-b from-slate-50 to-slate-50/95 dark:from-slate-950 dark:to-slate-950/95 backdrop-blur-sm flex items-center justify-between"
      animate={{ y: headerHidden ? "-100%" : 0 }}
      transition={{ duration: transitionDuration, ease: "easeInOut" }}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{current.title}</h1>
        <p className="text-sm text-muted-foreground">{current.subtitle}</p>
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
                if (!isActive) navigateTo(item.path, router);
              }}
            >
              <item.icon className={cn("w-5 h-5", isActive && "text-primary")} />
              <span className="sr-only">{item.label}</span>
            </Button>
          );
        })}
      </div>
    </motion.header>
  );
}
