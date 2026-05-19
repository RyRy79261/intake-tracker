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
          This app was created by me in response to difficulties in tracking
          the things needed to manage a new chronic condition. The hope is if
          anyone else needs this app the way I do, that it is here now.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          I can&apos;t offer the AI features for free but I can make it easier
          to set it up yourself and use it.
        </p>
      </div>
    </div>
  );
}
