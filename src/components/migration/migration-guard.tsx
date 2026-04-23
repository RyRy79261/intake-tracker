"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { checkInterruptedMigration } from "@/lib/migration-service";

const MigrationWizard = lazy(() =>
  import("./migration-wizard").then((m) => ({ default: m.MigrationWizard })),
);

export function MigrationGuard() {
  const checkedRef = useRef(false);
  const [showResume, setShowResume] = useState(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    if (checkInterruptedMigration()) {
      setShowResume(true);
    }
  }, []);

  if (!showResume) return null;

  return (
    <Suspense fallback={null}>
      <MigrationWizard
        open={showResume}
        onOpenChange={setShowResume}
        resume
      />
    </Suspense>
  );
}
