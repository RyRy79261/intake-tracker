"use client";

import { Reorder } from "motion/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Navigation, ArrowRightLeft, GripVertical } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { CARD_THEMES } from "@/lib/card-themes";
import { QUICK_NAV_LABEL_OVERRIDES } from "@/lib/quick-nav-defaults";
import { cn } from "@/lib/utils";

export function QuickNavSection() {
  const settings = useSettings();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
        <Navigation className="w-4 h-4" />
        <h3 className="font-semibold">Quick Navigation</h3>
      </div>
      <div className="space-y-3 pl-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Quick Nav Footer</p>
            <p className="text-xs text-muted-foreground">
              Show a footer bar to jump to sections
            </p>
          </div>
          <Button
            variant={settings.showQuickNav ? "default" : "outline"}
            size="sm"
            onClick={() => settings.setShowQuickNav(!settings.showQuickNav)}
          >
            {settings.showQuickNav ? "On" : "Off"}
          </Button>
        </div>

        {settings.showQuickNav && (
          <>
            <div className="space-y-2">
              <Label>
                <span className="flex items-center gap-1.5">
                  <GripVertical className="w-3.5 h-3.5" />
                  Footer Items
                </span>
              </Label>
              <p className="text-xs text-muted-foreground">
                Drag to reorder. Toggle to show/hide in the footer.
              </p>
              <Reorder.Group
                axis="y"
                values={settings.quickNavItems}
                onReorder={settings.setQuickNavItems}
                className="flex flex-col gap-1.5 rounded-lg border bg-background/50 p-2"
              >
                {settings.quickNavItems.map((item) => {
                  const theme = CARD_THEMES[item.id];
                  const Icon = theme.icon;
                  const label = QUICK_NAV_LABEL_OVERRIDES[item.id] ?? theme.label;
                  return (
                    <Reorder.Item
                      key={item.id}
                      value={item}
                      className={cn(
                        "flex items-center gap-3 rounded-md border bg-card px-2 py-1.5",
                        "cursor-grab active:cursor-grabbing touch-none select-none",
                        !item.enabled && "opacity-50"
                      )}
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className={cn("p-1 rounded", theme.iconBg)}>
                        <Icon className={cn("w-3.5 h-3.5", theme.iconColor)} />
                      </div>
                      <span className="flex-1 text-sm font-medium">{label}</span>
                      <Switch
                        checked={item.enabled}
                        onCheckedChange={(checked) => {
                          const next = settings.quickNavItems.map((i) =>
                            i.id === item.id ? { ...i, enabled: checked } : i
                          );
                          settings.setQuickNavItems(next);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-nav-order">
                <span className="flex items-center gap-1.5">
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Icon Order
                </span>
              </Label>
              <Select
                value={settings.quickNavOrder}
                onValueChange={(value: "ltr" | "rtl") => settings.setQuickNavOrder(value)}
              >
                <SelectTrigger id="quick-nav-order" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rtl">Right to Left (recommended)</SelectItem>
                  <SelectItem value="ltr">Left to Right</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                RTL puts your most-used sections closest to your right thumb
              </p>
            </div>

          </>
        )}
      </div>
    </div>
  );
}
