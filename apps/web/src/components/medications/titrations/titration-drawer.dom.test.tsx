// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render } from "@testing-library/react";

// Before Dexie resolves, useLiveQuery hands back its default — a fresh `[]`
// on every render. Model that worst case: both hooks return a new array
// every time they are called.
vi.mock("@/hooks/use-medication-queries", () => ({
  useCreateTitrationPlan: vi.fn(),
  useUpdateTitrationPlan: vi.fn(),
  usePhasesForTitrationPlan: vi.fn(() => []),
  usePhasesForPrescription: vi.fn(() => []),
  useSchedulesForPhase: vi.fn(() => []),
}));

import { CurrentRegimenLoader } from "@/components/medications/titrations/titration-drawer";

describe("CurrentRegimenLoader", () => {
  it("does not re-report an unchanged regimen when the parent re-renders", () => {
    let calls = 0;
    function Parent() {
      const [, setRegimens] = useState<Record<string, unknown>>({});
      return (
        <CurrentRegimenLoader
          prescriptionId="rx-1"
          onLoad={(regimen) => {
            calls++;
            // Guard so a render loop fails the test instead of hanging it.
            if (calls > 20) throw new Error("render loop");
            setRegimens((prev) => ({ ...prev, "rx-1": regimen }));
          }}
        />
      );
    }

    render(<Parent />);
    expect(calls).toBe(1);
  });
});
