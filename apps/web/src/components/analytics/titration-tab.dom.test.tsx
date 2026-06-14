// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { TitrationTab } from "@/components/analytics/titration-tab";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makePrescription,
  makeMedicationPhase,
  makeBloodPressureRecord,
} from "@/__tests__/fixtures/db-fixtures";
import type { TimeRange } from "@intake/types/analytics";

const DAY_MS = 86_400_000;
const RANGE: TimeRange = { start: 0, end: Date.now() + DAY_MS };

describe("TitrationTab", () => {
  it("shows the empty state when there are no prescriptions", async () => {
    await renderWithFixtures(<TitrationTab range={RANGE} />);

    expect(
      await screen.findByText("No prescriptions to analyze"),
    ).toBeInTheDocument();
  });

  it("renders a prescription section with its phase metrics", async () => {
    const now = Date.now();
    const rx = makePrescription({ genericName: "Lisinopril", isActive: true });
    // A phase spanning the last 20 days so seeded BP readings fall inside it.
    // makeMedicationPhase defaults endDate to undefined (an ongoing phase).
    const phase = makeMedicationPhase(rx.id, {
      type: "maintenance",
      status: "active",
      startDate: now - 20 * DAY_MS,
    });

    await renderWithFixtures(<TitrationTab range={RANGE} />, {
      seed: {
        prescriptions: [rx],
        medicationPhases: [phase],
        bloodPressureRecords: [
          makeBloodPressureRecord({
            systolic: 130,
            diastolic: 85,
            timestamp: now - 10 * DAY_MS,
          }),
          makeBloodPressureRecord({
            systolic: 128,
            diastolic: 83,
            timestamp: now - 4 * DAY_MS,
          }),
        ],
      },
    });

    // Prescription header.
    expect(await screen.findByText("Lisinopril")).toBeInTheDocument();
    // The maintenance phase badge renders (lowercased via CSS, raw text "maintenance").
    expect(await screen.findByText("maintenance")).toBeInTheDocument();
    // Average BP metric label appears once the phase has health data.
    expect(await screen.findByText("Avg BP")).toBeInTheDocument();
  });

  it("reports a phase with no health data using the explicit no-data message", async () => {
    const now = Date.now();
    const rx = makePrescription({ genericName: "Amlodipine", isActive: true });
    const phase = makeMedicationPhase(rx.id, {
      startDate: now - 5 * DAY_MS,
    });

    await renderWithFixtures(<TitrationTab range={RANGE} />, {
      seed: { prescriptions: [rx], medicationPhases: [phase] },
    });

    expect(await screen.findByText("Amlodipine")).toBeInTheDocument();
    expect(
      await screen.findByText("No health data recorded during this phase"),
    ).toBeInTheDocument();
  });
});
