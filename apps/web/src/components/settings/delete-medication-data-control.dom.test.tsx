// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DeleteMedicationDataControl } from "@/components/settings/delete-medication-data-control";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
/* eslint-disable-next-line no-restricted-imports -- test seeds and asserts the stored rows */
import { db } from "@/lib/db";
import {
  makeIntakeRecord,
  makePrescription,
  makeDoseLog,
} from "@/__tests__/fixtures/db-fixtures";

async function seed() {
  await db.prescriptions.add(makePrescription({ id: "rx" }));
  await db.doseLogs.add(makeDoseLog("rx", "ph", "sch", { id: "dose" }));
  await db.intakeRecords.add(makeIntakeRecord({ id: "water" }));
}

describe("DeleteMedicationDataControl", () => {
  it("deletes nothing until the user types the confirmation phrase", async () => {
    const user = userEvent.setup();
    await seed();
    await renderWithFixtures(<DeleteMedicationDataControl />);

    await user.click(
      screen.getByRole("button", { name: /delete all medication data/i }),
    );
    const confirm = await screen.findByRole("button", { name: /^delete medication data$/i });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/type delete to confirm/i), "DEL");
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect((await db.prescriptions.get("rx"))?.deletedAt).toBeNull();
    expect(await db._syncQueue.count()).toBe(0);
  });

  it("wipes medication data (not health records) once confirmed", async () => {
    const user = userEvent.setup();
    await seed();
    await renderWithFixtures(<DeleteMedicationDataControl />);

    await user.click(
      screen.getByRole("button", { name: /delete all medication data/i }),
    );
    await user.type(await screen.findByLabelText(/type delete to confirm/i), "DELETE");
    await user.click(screen.getByRole("button", { name: /^delete medication data$/i }));

    await waitFor(async () => {
      expect((await db.prescriptions.get("rx"))?.deletedAt).not.toBeNull();
    });
    expect((await db.doseLogs.get("dose"))?.deletedAt).not.toBeNull();
    expect((await db.intakeRecords.get("water"))?.deletedAt).toBeNull();
  });
});
