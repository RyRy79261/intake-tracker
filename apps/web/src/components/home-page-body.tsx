"use client";

import { useEffect, useState } from "react";
import { TodayGadget } from "@/components/home/today-gadget";
import { HOME_CARDS } from "@/components/shell/module-registry";
import { Droplets } from "lucide-react";

/**
 * Home: the Today gadget over a scroll of the module cards (the registry's
 * cards, in its order). The shell renders it under the windows on every
 * window route, so it stays mounted while windows open and close.
 */
export function HomePageBody() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Droplets className="w-6 h-6 animate-pulse" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 pb-3">
      <TodayGadget />
      <div className="wc-mods">
        {HOME_CARDS.map(({ id, Body }) => (
          <Body key={id} />
        ))}
      </div>
    </div>
  );
}
