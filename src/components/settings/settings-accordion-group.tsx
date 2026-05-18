"use client";

import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsAccordionGroupProps {
  value: string;
  icon: LucideIcon;
  label: string;
  iconColorClass: string;
  children: React.ReactNode;
}

export function SettingsAccordionGroup({
  value,
  icon: Icon,
  label,
  iconColorClass,
  children,
}: SettingsAccordionGroupProps) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="px-2 py-3 hover:no-underline">
        <div className="flex items-center gap-2">
          <Icon className={cn("w-4 h-4", iconColorClass)} />
          <span className="text-base font-semibold">{label}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-6 pl-2 pb-2">
          {children}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
