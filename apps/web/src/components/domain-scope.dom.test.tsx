// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/auth-guard", () => ({
  useAuthGate: () => false,
}));

import { LiquidsCard } from "@/components/liquids-card";
import { FoodSaltCard } from "@/components/food-salt-card";
import { BloodPressureCard } from "@/components/blood-pressure-card";
import { WeightCard } from "@/components/weight-card";
import { UrinationCard } from "@/components/urination-card";
import { DefecationCard } from "@/components/defecation-card";
import { EditWeightDialog } from "@/components/edit-weight-dialog";
import { EditIntakeDialog } from "@/components/edit-intake-dialog";
import { EditUrinationDialog } from "@/components/edit-urination-dialog";
import { ManualInputDialog } from "@/components/manual-input-dialog";
import { FieldScope, Pip, SubToggle } from "@/components/domain-scope";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import { makeIntakeRecord, makeUrinationRecord, makeWeightRecord } from "@/__tests__/fixtures/db-fixtures";

/*
 * The domain scope on the input screens. jsdom does not run the stylesheet
 * cascade, so these tests check the two ends the cascade joins: the scope
 * attribute on the card (the rule behind it is pinned in
 * lib/domain-scope.test.ts) and the variable-reading classes on the controls
 * inside it.
 */

/** The nearest domain scope an element sits in. */
function scopeOf(el: Element): string | null {
  return el.closest("[data-domain]")?.getAttribute("data-domain") ?? null;
}

/** A primary button reads `--primary` for its fill, text, hover and focus ring. */
function expectPrimary(button: HTMLElement) {
  expect(button.className).toContain("bg-primary");
  expect(button.className).toContain("text-primary-foreground");
  expect(button.className).toContain("hover:bg-(--primary-hover)");
  expect(button.className).toContain("focus-visible:outline-ring");
  // No hard-coded palette overriding the scope.
  expect(button.className).not.toMatch(/\bbg-(sky|amber|rose|emerald|violet|stone|orange|pink)-\d/);
}

/** An input reads `--ring` for its focus ring and caret. */
function expectRing(input: HTMLElement) {
  expect(input.className).toContain("focus-visible:outline-ring");
  expect(input.className).toContain("caret-ring");
}

afterEach(cleanup);

describe("home cards open a domain scope", () => {
  it("Liquids follows the tab: water, water, caffeine, alcohol", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<LiquidsCard />);
    const card = await screen.findByTestId("liquids-card");
    expect(card).toHaveAttribute("data-domain", "water");

    const confirm = within(card).getByRole("button", { name: "Confirm Entry" });
    expectPrimary(confirm);
    expect(scopeOf(confirm)).toBe("water");

    await user.click(within(card).getByRole("tab", { name: "Beverage" }));
    expect(card).toHaveAttribute("data-domain", "water");
    await user.click(within(card).getByRole("tab", { name: "Coffee" }));
    expect(card).toHaveAttribute("data-domain", "caffeine");
    await user.click(within(card).getByRole("tab", { name: "Alcohol" }));
    expect(card).toHaveAttribute("data-domain", "alcohol");

    // The active tab's underline reads the scope too.
    expect(within(card).getByRole("tab", { name: "Alcohol" }).className).toContain("hsl(var(--primary))");
  });

  it("a coffee entry's volume is water, its sugar is sugar, its strength is the card's", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<LiquidsCard />);
    const card = await screen.findByTestId("liquids-card");
    await user.click(within(card).getByRole("tab", { name: "Coffee" }));

    const volume = card.querySelector<HTMLElement>("#coffee-volume");
    const strength = card.querySelector<HTMLElement>("#coffee-per100ml");
    const sugar = card.querySelector<HTMLElement>("#coffee-sugar");
    expect(volume && scopeOf(volume)).toBe("water");
    expect(strength && scopeOf(strength)).toBe("caffeine");
    expect(sugar && scopeOf(sugar)).toBe("sugar");
    for (const input of [volume, strength, sugar]) if (input) expectRing(input);
  });

  it("Food is sodium, with sugar and water fields in their own colours", async () => {
    await renderWithFixtures(<FoodSaltCard />);
    const card = await screen.findByTestId("food-card");
    expect(card).toHaveAttribute("data-domain", "sodium");

    const sodium = within(card).getByLabelText("Sodium");
    const sugar = within(card).getByLabelText(/^Sugar \(g\)/);
    const water = within(card).getByLabelText(/^Water content/);
    expect(scopeOf(sodium)).toBe("sodium");
    expect(scopeOf(sugar)).toBe("sugar");
    expect(scopeOf(water)).toBe("water");
    for (const input of [sodium, sugar, water]) expectRing(input);

    // Each nutrient label carries a pip, hidden from assistive tech: the
    // label text names the nutrient, colour is not the only cue.
    for (const input of [sodium, sugar, water]) {
      const pip = card.querySelector(`label[for="${input.id}"] [data-pip]`);
      expect(pip, input.id).not.toBeNull();
      expect(pip).toHaveAttribute("aria-hidden", "true");
    }

    const record = within(card).getByRole("button", { name: "Record with details" });
    expectPrimary(record);
    expect(scopeOf(record)).toBe("sodium");
    // Disabled it keeps the dashed outline, not a faded fill.
    expect(record).toBeDisabled();
    expect(record.className).toContain("disabled:border-dashed");
  });

  it("Blood Pressure is bp: inputs, unit, options and Record Reading", async () => {
    const user = userEvent.setup();
    await renderWithFixtures(<BloodPressureCard />);
    const card = await screen.findByTestId("bp-card");
    expect(card).toHaveAttribute("data-domain", "bp");

    const systolic = within(card).getByLabelText("Systolic (top)");
    expectRing(systolic);
    expect(systolic.className).toContain("num");
    expect(within(card).getByText("BPM").className).toContain("var(--c");

    const record = within(card).getByRole("button", { name: /Record Reading/ });
    expectPrimary(record);
    expect(scopeOf(record)).toBe("bp");

    // "More options" is a disclosure row in the sub-heading style.
    const more = within(card).getByRole("button", { name: "More options" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more.querySelector(".subhead")).not.toBeNull();
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");

    // The chosen option is marked by state and outline, not by colour alone.
    const sitting = within(card).getByRole("button", { name: "Sitting" });
    const standing = within(card).getByRole("button", { name: "Standing" });
    expect(sitting).toHaveAttribute("aria-pressed", "true");
    expect(standing).toHaveAttribute("aria-pressed", "false");
    expect(sitting.className).toContain("border-primary");
    expect(standing.className).not.toContain("border-primary");
  });

  it("Weight is weight: Record Weight", async () => {
    await renderWithFixtures(<WeightCard />, { seed: { weightRecords: [makeWeightRecord({ weight: 80 })] } });
    const card = await screen.findByTestId("weight-card");
    expect(card).toHaveAttribute("data-domain", "weight");
    const record = await within(card).findByRole("button", { name: /Record Weight/ });
    expectPrimary(record);
    expect(scopeOf(record)).toBe("weight");
    // The unit sits inside the input surface, where the green fails AA as
    // text, so it stays muted.
    expect(within(card).getByText("kg", { selector: "label span" }).className).toContain("text-muted-foreground");
  });

  it.each([
    ["Urination", UrinationCard, "urination-card"],
    ["Defecation", DefecationCard, "defecation-card"],
  ] as const)("%s is bath: details and Record with details", async (_name, Card, testId) => {
    const user = userEvent.setup();
    await renderWithFixtures(<Card />);
    const card = await screen.findByTestId(testId);
    expect(card).toHaveAttribute("data-domain", "bath");

    await user.click(within(card).getByRole("button", { name: "Add details" }));
    const record = within(card).getByRole("button", { name: "Record with details" });
    expectPrimary(record);
    expect(scopeOf(record)).toBe("bath");
    expectRing(within(card).getByLabelText("When"));
  });

  it("labels the Recent list with a sub-heading in the card colour", async () => {
    await renderWithFixtures(<UrinationCard />);
    const card = await screen.findByTestId("urination-card");
    const recent = await within(card).findByRole("heading", { name: "Recent" });
    expect(recent.className).toContain("subhead");
    expect(scopeOf(recent)).toBe("bath");
  });
});

describe("dialogs open their entry's scope (they render outside the card)", () => {
  const noop = () => {};

  it("edit weight: weight", () => {
    render(
      <EditWeightDialog
        record={makeWeightRecord({ weight: 80 })}
        onClose={noop}
        onSubmit={noop}
        weight="80"
        onWeightChange={noop}
        timestamp=""
        onTimestampChange={noop}
        note=""
        onNoteChange={noop}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-domain", "weight");
    // The title stripe.
    expect(dialog.className).toContain("data-[domain]:shadow-[inset_0_3px_0_var(--c)]");
    expectPrimary(within(dialog).getByRole("button", { name: "Save Changes" }));
  });

  it.each([
    ["water", "water"],
    ["salt", "sodium"],
    ["sugar", "sugar"],
    ["potassium", "ink"],
  ] as const)("edit %s intake: %s", (type, domain) => {
    render(
      <EditIntakeDialog
        record={makeIntakeRecord({ type, amount: 100 })}
        onClose={noop}
        onSubmit={noop}
        amount="100"
        onAmountChange={noop}
        timestamp=""
        onTimestampChange={noop}
        note=""
        onNoteChange={noop}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-domain", domain);
    expectPrimary(within(dialog).getByRole("button", { name: "Save Changes" }));
  });

  it("edit urination: bath", () => {
    render(
      <EditUrinationDialog
        record={makeUrinationRecord({})}
        onClose={noop}
        onSubmit={noop}
        timestamp=""
        onTimestampChange={noop}
        amount=""
        onAmountChange={noop}
        note=""
        onNoteChange={noop}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-domain", "bath");
    expectPrimary(within(dialog).getByRole("button", { name: "Save Changes" }));
  });

  it("the amount dialog: water, with the chosen quick amount pressed", async () => {
    const user = userEvent.setup();
    render(<ManualInputDialog open onOpenChange={noop} type="water" currentValue={250} onSubmit={noop} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-domain", "water");
    const chip = within(dialog).getByRole("button", { name: "250ml" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip.className).toContain("bg-primary");
    await user.click(within(dialog).getByRole("button", { name: "500ml" }));
    expect(within(dialog).getByRole("button", { name: "500ml" })).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });
});

describe("scope building blocks", () => {
  it("FieldScope nests a domain; Pip is decorative", () => {
    render(
      <div data-domain="sodium">
        <FieldScope domain="sugar" data-testid="field">
          <Pip />
        </FieldScope>
      </div>,
    );
    const field = screen.getByTestId("field");
    expect(field).toHaveAttribute("data-domain", "sugar");
    const pip = field.querySelector("[data-pip]");
    expect(pip).toHaveAttribute("aria-hidden", "true");
    expect(pip?.className).toContain("pip");
  });

  it("SubToggle is a 36px disclosure button that reports its state", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <SubToggle expanded={false} onToggle={onToggle}>
        Set different time
      </SubToggle>,
    );
    const button = screen.getByRole("button", { name: "Set different time" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button.className).toContain("h-9");
    expect(button.className).toContain("w-full");
    expect(button.className).toContain("focus-visible:outline-ring");
    await user.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
