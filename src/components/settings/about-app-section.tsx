"use client";

import { Heart } from "lucide-react";

export function AboutAppSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
        <Heart className="w-4 h-4" />
        <h3 className="font-semibold">About this app</h3>
      </div>
      <div className="space-y-3 pl-0">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Built by someone navigating their own chronic health journey — a tool
          first made for personal use to keep track of intake, vitals, and
          medications day to day.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Shared freely with anyone walking a similar path, in the hope that it
          makes the daily work of staying on top of things a little lighter.
        </p>
      </div>
    </div>
  );
}
