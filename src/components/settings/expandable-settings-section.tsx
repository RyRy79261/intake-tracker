"use client";

import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpandableSettingsSectionProps {
  icon: LucideIcon;
  label: string;
  iconColorClass: string;
  headerRight?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function ExpandableSettingsSection({
  icon: Icon,
  label,
  iconColorClass,
  headerRight,
  defaultOpen = false,
  children,
}: ExpandableSettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex flex-1 items-center gap-2 font-semibold text-left hover:opacity-80 transition-opacity",
              iconColorClass
            )}
          >
            <Icon className="w-4 h-4" />
            <h3 className="font-semibold">{label}</h3>
            <ChevronDown
              className={cn(
                "w-4 h-4 shrink-0 text-muted-foreground ml-auto transition-transform duration-200",
                open && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>
        {headerRight}
      </div>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="pl-6 pt-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
