// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BrandSwitchPicker } from "@/components/medications/brand-switch-picker";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
// A test asserting a write reached Dexie needs the db handle directly; the
// no-restricted-imports rule targets app components, not test files.
// eslint-disable-next-line no-restricted-imports
import { db } from "@/lib/db";
import { makePrescription, makeInventoryItem } from "@/__tests__/fixtures/db-fixtures";

describe("BrandSwitchPicker", () => {
  it("leaves exactly one active brand after a switch", async () => {
    const user = userEvent.setup();
    const prescription = makePrescription();
    // Two active brands (a sync race) and the one being switched to.
    const a = makeInventoryItem(prescription.id, { brandName: "Brand A", isActive: true });
    const b = makeInventoryItem(prescription.id, { brandName: "Brand B", isActive: true });
    const c = makeInventoryItem(prescription.id, { brandName: "Brand C", isActive: false });
    await renderWithFixtures(
      <BrandSwitchPicker open onOpenChange={() => {}} prescriptionId={prescription.id} />,
      { seed: { prescriptions: [prescription], inventoryItems: [a, b, c] } },
    );

    await user.click(await screen.findByRole("button", { name: /brand c/i }));

    await vi.waitFor(async () => {
      const items = await db.inventoryItems.where("prescriptionId").equals(prescription.id).toArray();
      expect(items.filter((i) => i.isActive).map((i) => i.id)).toEqual([c.id]);
    });
  });

  it("hides deleted brands and warns when no brand is active", async () => {
    const prescription = makePrescription();
    const deleted = makeInventoryItem(prescription.id, { brandName: "Gone", isActive: true, deletedAt: 1 });
    const spare = makeInventoryItem(prescription.id, { brandName: "Spare", isActive: false });
    await renderWithFixtures(
      <BrandSwitchPicker open onOpenChange={() => {}} prescriptionId={prescription.id} />,
      { seed: { prescriptions: [prescription], inventoryItems: [deleted, spare] } },
    );

    expect(await screen.findByText("Spare")).toBeInTheDocument();
    expect(screen.queryByText("Gone")).not.toBeInTheDocument();
    expect(screen.getByText(/no active brand/i)).toBeInTheDocument();
  });
});
