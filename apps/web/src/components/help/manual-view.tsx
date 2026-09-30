"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MANUAL_DOMAINS, type Manual } from "@/lib/help/manuals";
import { HelpTopBar } from "@/components/help/help-top-bar";
import { manualDomainStyle } from "@/components/help/help-index";
import { ManualCallout } from "@/components/help/manual-callout";
import { ComponentPreview } from "@/components/help/component-preview";
import { getManualPreview } from "@/components/help/preview-registry";
import { PreviewSafeZone } from "@/components/help/preview-scope";

const BACK =
  "-mt-1 mb-1 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground";

/**
 * One guide: header with "Where to find it", the live demo when the guide
 * has one, then its sections (prose, numbered steps, bullets, a callout).
 * In the manual window `onBack` returns to the index in place; on the
 * `/help/<slug>` page (legacy frame) "All guides" links to `/help`.
 */
export function ManualView({ manual, onBack }: { manual: Manual; onBack?: () => void }) {
  const router = useRouter();
  const Icon = manual.icon;
  const preview = getManualPreview(manual.slug);
  const domain = MANUAL_DOMAINS.find((d) => d.id === manual.domain);

  return (
    <PreviewSafeZone className="pb-6">
      <div style={manualDomainStyle(domain)} data-testid="manual-view" data-slug={manual.slug}>
        {!onBack && <HelpTopBar title="User Manual" onBack={() => router.back()} />}
        {onBack ? (
          <button type="button" className={BACK} onClick={onBack}>
            <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
            All guides
          </button>
        ) : (
          <Link href="/help" className={BACK}>
            <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
            All guides
          </Link>
        )}

        <header>
          <h2 className="flex items-center gap-2 text-xl font-semibold leading-tight">
            <Icon className="h-5 w-5 shrink-0 text-[color:var(--c)]" strokeWidth={1.5} aria-hidden="true" />
            {manual.title}
          </h2>
          <p className="mt-1.5 text-sm leading-[1.45] text-muted-foreground">{manual.summary}</p>
          <p className="mt-2.5 bg-chrome px-2.5 py-2 text-xs leading-[1.4] text-muted-foreground">
            <b className="font-semibold text-foreground">Where to find it: </b>
            {manual.whereToFind}
          </p>
        </header>

        {preview && (
          <div className="mb-[18px]">
            <ComponentPreview key={manual.slug} seed={preview.seed}>
              {preview.render()}
            </ComponentPreview>
          </div>
        )}

        {manual.sections.map((section, index) => (
          <section key={index} className="mt-5">
            <h3 className="mb-1.5 text-[0.9375rem] font-semibold">{section.heading}</h3>

            {section.body &&
              section.body.split("\n\n").map((paragraph, p) => (
                <p key={p} className="text-sm leading-[1.55] text-muted-foreground [&+p]:mt-2">
                  {paragraph}
                </p>
              ))}

            {section.steps && (
              <ol className="mt-2 flex flex-col gap-2">
                {section.steps.map((step, s) => (
                  <li
                    key={s}
                    className="grid grid-cols-[22px_minmax(0,1fr)] gap-2.5 text-sm leading-normal text-muted-foreground"
                  >
                    <span className="flex h-[22px] w-[22px] items-center justify-center bg-[color-mix(in_srgb,hsl(var(--water))_18%,transparent)] font-mono text-xs font-semibold text-water">
                      {s + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}

            {section.bullets && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {section.bullets.map((bullet, b) => (
                  <li
                    key={b}
                    className="relative pl-3.5 text-sm leading-normal text-muted-foreground before:absolute before:left-0.5 before:top-[0.62em] before:h-[5px] before:w-[5px] before:bg-muted-foreground before:content-['']"
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            )}

            {section.callout && <ManualCallout callout={section.callout} className="mt-2.5" />}
          </section>
        ))}
      </div>
    </PreviewSafeZone>
  );
}
