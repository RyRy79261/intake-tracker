"use client";

import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ManualView } from "@/components/help/manual-view";
import { getManual } from "@/lib/help/manuals";

export default function ManualPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const manual = getManual(slug);

  if (!manual) {
    return (
      <div className="space-y-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          That manual could not be found.
        </p>
        <Button onClick={() => router.push("/help")}>Back to the manual</Button>
      </div>
    );
  }

  return <ManualView manual={manual} />;
}
