// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RxEntryCard } from "@/components/medications/titrations/rx-entry-card";
import type { RxEntry } from "@/components/medications/titrations/types";
import type { Prescription } from "@/lib/db";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeInventoryItem,
} from "@/__tests__/fixtures/db-fixtures";

/** Holds the entry state the titration drawer would own. */
function Harness({ rx, onEntry }: { rx: Prescription; onEntry: (e: RxEntry) => void }) {
  const [entry, setEntry] = useState<RxEntry>({
    prescriptionId: rx.id,
    schedules: [{ time: "08:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], dosage: "" }],
  });
  const update = (next: RxEntry) => {
    setEntry(next);
    onEntry(next);
  };
  return (
    <RxEntryCard
      entry={entry}
      entryIdx={0}
      prescriptions={[rx]}
      existingRxIds={[rx.id]}
      onSelectPrescription={() => {}}
      onUpdate={(u) => update({ ...entry, ...u })}
      onRemove={() => {}}
      onAddSchedule={() => {}}
      onRemoveSchedule={() => {}}
      onUpdateSchedule={(i, u) =>
        update({
          ...entry,
          schedules: entry.schedules.map((s, j) => (j === i ? { ...s, ...u } : s)),
        })
      }
    />
  );
}

describe("RxEntryCard", () => {
  it("takes a combination titration dose as tablets of the active brand", async () => {
    const user = userEvent.setup();
    const rx = makePrescription({ genericName: "Sacubitril/valsartan" });
    const brand = makeInventoryItem(rx.id, {
      brandName: "Entresto",
      strength: 100,
      unit: "mg",
      compounds: [
        { name: "Sacubitril", strength: 49 },
        { name: "Valsartan", strength: 51 },
      ],
    });
    let latest: RxEntry | undefined;
    await renderWithFixtures(<Harness rx={rx} onEntry={(e) => { latest = e; }} />, {
      seed: { prescriptions: [rx], inventoryItems: [brand] },
    });

    const tablets = await screen.findByLabelText(/tablets per dose/i);
    await user.type(tablets, "2");

    // Stored as the summed mg the pill math divides by the brand strength.
    expect(latest?.schedules[0]?.dosage).toBe("200");
    expect(await screen.findByText(/98\/102mg/)).toBeInTheDocument();
  });

  it("previews a single-compound dose in tablets and flags an odd fraction", async () => {
    const user = userEvent.setup();
    const rx = makePrescription({ genericName: "Bisoprolol" });
    const brand = makeInventoryItem(rx.id, { brandName: "Concor", strength: 5, unit: "mg" });
    await renderWithFixtures(<Harness rx={rx} onEntry={() => {}} />, {
      seed: { prescriptions: [rx], inventoryItems: [brand] },
    });

    const dose = await screen.findByLabelText(/dose in mg/i);
    await user.type(dose, "2.5");
    expect(await screen.findByText(/½ tablet of Concor 5mg/)).toBeInTheDocument();

    await user.clear(dose);
    await user.type(dose, "4");
    expect(await screen.findByText(/not a whole or half tablet/i)).toBeInTheDocument();
  });
});
