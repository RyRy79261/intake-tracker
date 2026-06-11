"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getManualsByDomain } from "@/lib/help/manuals";
import { HelpTopBar } from "@/components/help/help-top-bar";

export function HelpIndex() {
  const router = useRouter();
  const groups = getManualsByDomain();

  return (
    <div className="pb-12">
      <HelpTopBar title="User Manual" onBack={() => router.back()} />

      <p className="mb-6 px-1 text-sm text-muted-foreground">
        Short guides for every card, input and feature in Intake Tracker. Pick
        the thing you want to learn about.
      </p>

      <div className="space-y-8">
        {groups.map(({ domain, manuals }) => {
          const DomainIcon = domain.icon;
          return (
            <section key={domain.id}>
              <div className="mb-1 flex items-center gap-2">
                <DomainIcon className={cn("h-4 w-4", domain.colorClass)} />
                <h2 className="font-semibold">{domain.label}</h2>
              </div>
              <p className="mb-3 pl-6 text-xs text-muted-foreground">
                {domain.blurb}
              </p>

              <div className="space-y-2">
                {manuals.map((manual) => {
                  const ManualIcon = manual.icon;
                  return (
                    <Link
                      key={manual.slug}
                      href={`/help/${manual.slug}`}
                      className="flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
                    >
                      <div className="shrink-0 rounded-lg bg-muted p-2">
                        <ManualIcon
                          className={cn("h-4 w-4", domain.colorClass)}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{manual.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {manual.summary}
                        </p>
                      </div>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
