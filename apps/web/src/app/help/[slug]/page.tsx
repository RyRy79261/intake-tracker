import { MANUALS } from "@/lib/help/manuals";
import { ManualPageClient } from "@/app/help/[slug]/manual-page-client";

// Pre-render every known manual slug. Required for `output: export` (the
// Capacitor build) — a dynamic segment with no params can't be statically
// emitted — and a free SSG win on the hosted web build too. Every slug is a
// compile-time constant in MANUALS, so the set is fully known at build.
export function generateStaticParams() {
  return MANUALS.map((m) => ({ slug: m.slug }));
}

export default async function ManualPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ManualPageClient slug={slug} />;
}
