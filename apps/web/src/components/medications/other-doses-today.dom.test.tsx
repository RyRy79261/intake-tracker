// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OtherDosesToday } from "@/components/medications/other-doses-today";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
// eslint-disable-next-line no-restricted-imports
import { logUnlistedDose } from "@/lib/dose-log-service";
import { toLocalDateKey } from "@/lib/date-utils";

/**
 * An unlisted medicine logged by voice is a PRN dose with a name and no
 * prescription. It shows with the day's other doses under its own name, and
 * Undo removes it.
 */
describe("OtherDosesToday — a medicine not on the list", () => {
  const takenAt = new Date(2026, 8, 1, 9, 5).getTime();
  const dateKey = toLocalDateKey(takenAt);

  it("shows the medicine by name with its amount, and removes it on Undo", async () => {
    const logged = await logUnlistedDose({
      medicineName: "Paracetamol",
      takenAt,
      amount: 1,
      unit: "tablet",
    });
    if (!logged.success) throw new Error("expected success");
    const user = userEvent.setup();
    await renderWithFixtures(<OtherDosesToday dateKey={dateKey} isToday={false} />);

    expect(await screen.findByText("Not on your medication list")).toBeInTheDocument();
    expect(screen.getByText("Paracetamol")).toBeInTheDocument();
    expect(screen.getByText("1 tablet")).toBeInTheDocument();
    expect(screen.getByText("09:05")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo Paracetamol at 09:05" }));
    await user.click(screen.getByRole("button", { name: "Confirm remove Paracetamol at 09:05" }));
    await waitFor(async () => {
      expect((await db.doseLogs.get(logged.data.id))?.deletedAt).not.toBeNull();
    });
  });
});
