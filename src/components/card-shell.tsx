"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type CardTheme } from "@/lib/card-themes";

interface CardShellProps {
  theme: CardTheme;
  /** Override the theme label (e.g. "Food + Sodium" for the eating theme). */
  label?: string;
  /** Right-side header content: latest stat, loading skeleton, or progress widget. */
  headerRight?: ReactNode;
  children: ReactNode;
}

/**
 * Shared outer chrome for the dashboard health cards. Renders the themed
 * `<Card>` wrapper, the `<CardContent>` with the cards' standard `p-6`
 * padding, and the icon + label header row with a slot for right-side stats.
 */
export function CardShell({ theme, label, headerRight, children }: CardShellProps) {
  const Icon = theme.icon;
  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-300 bg-linear-to-br",
        theme.gradient,
        theme.border,
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-lg", theme.iconBg)}>
              <Icon className={cn("w-5 h-5", theme.iconColor)} />
            </div>
            <span className="font-semibold text-lg uppercase tracking-wide">
              {label ?? theme.label}
            </span>
          </div>
          {headerRight}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
