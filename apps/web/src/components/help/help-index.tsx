"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { domainColor } from "@/lib/domain-colors";
import { getManualsByDomain, type Manual, type ManualDomain } from "@/lib/help/manuals";
import { HelpTopBar } from "@/components/help/help-top-bar";

/** A manual domain's colour as a CSS colour; muted for "App & settings". */
export function manualDomainStyle(domain: ManualDomain | undefined): CSSProperties {
  const c = domain?.color ? domainColor(domain.color) : "hsl(var(--muted-foreground))";
  return { "--c": c } as CSSProperties;
}

const ITEM =
  "grid min-h-[60px] w-full grid-cols-[36px_minmax(0,1fr)_16px] items-center gap-2.5 border border-line bg-background px-2.5 py-2 text-left transition-colors hover:bg-chrome focus-visible:outline-offset-[-2px]";

function ItemBody({ manual }: { manual: Manual }) {
  const Icon = manual.icon;
  return (
    <>
      <span className="flex h-9 w-9 items-center justify-center bg-chrome text-[color:var(--c)]">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <b className="block text-sm font-semibold leading-[1.3]">{manual.title}</b>
        <small className="mt-0.5 block text-xs leading-[1.35] text-muted-foreground">
          {manual.summary}
        </small>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </>
  );
}

/**
 * The manual's index: every guide, grouped by domain under a coloured
 * heading. In the manual window `onOpen` shows a guide in place; on the
 * `/help` page (legacy frame) each guide is a link to `/help/<slug>`.
 */
export function HelpIndex({ onOpen }: { onOpen?: (slug: string) => void }) {
  const router = useRouter();
  const groups = getManualsByDomain();

  const list: ReactNode = groups.map(({ domain, manuals }) => {
    const DomainIcon = domain.icon;
    return (
      <section key={domain.id} className="mb-[18px]" style={manualDomainStyle(domain)} data-domain={domain.id}>
        <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold">
          <DomainIcon className="h-[18px] w-[18px] text-[color:var(--c)]" strokeWidth={1.5} aria-hidden="true" />
          {domain.label}
        </h3>
        <p className="mb-2 ml-[26px] mt-0.5 text-xs text-muted-foreground">{domain.blurb}</p>
        <div className="flex flex-col gap-1.5">
          {manuals.map((manual) =>
            onOpen ? (
              <button key={manual.slug} type="button" className={ITEM} onClick={() => onOpen(manual.slug)}>
                <ItemBody manual={manual} />
              </button>
            ) : (
              <Link key={manual.slug} href={`/help/${manual.slug}`} className={ITEM}>
                <ItemBody manual={manual} />
              </Link>
            ),
          )}
        </div>
      </section>
    );
  });

  return (
    <div className="pb-6" data-testid="help-index">
      {!onOpen && <HelpTopBar title="User Manual" onBack={() => router.back()} />}
      <p className="mb-3.5 text-sm leading-[1.45] text-muted-foreground">
        Short guides for every card, input and feature in Intake Tracker. Pick
        the thing you want to learn about.
      </p>
      {list}
    </div>
  );
}
