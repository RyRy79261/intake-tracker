// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DataManagementSection } from "@/components/settings/data-management-section";
import { renderWithFixtures } from "@/__tests__/react-test-utils";
import {
  makeIntakeRecord,
  makeUserProfile,
  makeInsightReport,
} from "@/__tests__/fixtures/db-fixtures";

describe("DataManagementSection", () => {
  it("renders the export and import controls", async () => {
    await renderWithFixtures(<DataManagementSection />);

    expect(screen.getByRole("button", { name: /export data/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import data/i })).toBeInTheDocument();
  });

  it("has no intake-only 'Clear All Data' button (deletion lives in Storage settings)", async () => {
    await renderWithFixtures(<DataManagementSection />);

    expect(
      screen.queryByRole("button", { name: /clear all data/i }),
    ).not.toBeInTheDocument();
  });

  it("reports the import total across every table, including profile and insight reports", async () => {
    const user = userEvent.setup();
    const { container } = await renderWithFixtures(<DataManagementSection />);

    const backup = {
      version: 5,
      exportedAt: new Date().toISOString(),
      intakeRecords: [makeIntakeRecord()],
      weightRecords: [],
      bloodPressureRecords: [],
      userProfile: [makeUserProfile()],
      insightReports: [makeInsightReport()],
    };
    const file = new File([JSON.stringify(backup)], "backup.json", {
      type: "application/json",
    });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await user.click(await screen.findByRole("button", { name: /continue import/i }));

    expect(await screen.findByText(/last import: 3 new/i)).toBeInTheDocument();
  });
});
