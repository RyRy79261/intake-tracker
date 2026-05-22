"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Manual } from "@/lib/help/manuals";
import { HelpTopBar } from "@/components/help/help-top-bar";
import { ManualCallout } from "@/components/help/manual-callout";
import { ComponentPreview } from "@/components/help/component-preview";
import { getManualPreview } from "@/components/help/preview-registry";

export function ManualView({ manual }: { manual: Manual }) {
  const router = useRouter();
  const Icon = manual.icon;
  const preview = getManualPreview(manual.slug);

  return (
    <div className="pb-12">
      <HelpTopBar title="User Manual" onBack={() => router.push("/help")} />

      <header className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">{manual.title}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{manual.summary}</p>
        <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Where to find it: </span>
          {manual.whereToFind}
        </p>
      </header>

      {preview && (
        <section className="mb-6">
          <h3 className="mb-2 font-semibold">Try it</h3>
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
            This is the real component, loaded with sample data. Tap and type —
            it works exactly as it does in the app, and nothing you do here is
            saved.
          </p>
          <ComponentPreview key={manual.slug} seed={preview.seed}>
            {preview.render()}
          </ComponentPreview>
        </section>
      )}

      <div className="space-y-6">
        {manual.sections.map((section, index) => (
          <section key={index}>
            <h3 className="mb-2 font-semibold">{section.heading}</h3>

            {section.body && (
              <div className="space-y-2">
                {section.body.split("\n\n").map((paragraph, p) => (
                  <p
                    key={p}
                    className="text-sm leading-relaxed text-muted-foreground"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            )}

            {section.steps && (
              <ol className={cn("space-y-2", section.body && "mt-3")}>
                {section.steps.map((step, s) => (
                  <li key={s} className="flex gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {s + 1}
                    </span>
                    <span className="leading-relaxed text-muted-foreground">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {section.bullets && (
              <ul className={cn("space-y-1.5", section.body && "mt-3")}>
                {section.bullets.map((bullet, b) => (
                  <li
                    key={b}
                    className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}

            {section.callout && (
              <ManualCallout callout={section.callout} className="mt-3" />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
