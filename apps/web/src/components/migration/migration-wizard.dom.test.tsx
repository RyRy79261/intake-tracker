// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { useMigrationStore } from "@/stores/migration-store";

const service = vi.hoisted(() => ({
  startMigration: vi.fn(async () => {}),
  cancelMigration: vi.fn(async () => {}),
  resumeMigration: vi.fn(async () => {}),
  completeMigration: vi.fn(async () => {}),
  downloadBackup: vi.fn(async () => {}),
}));

vi.mock("@/lib/migration-service", () => ({
  startMigration: service.startMigration,
  cancelMigration: service.cancelMigration,
  resumeMigration: service.resumeMigration,
  completeMigration: service.completeMigration,
}));
vi.mock("@/lib/backup-service", () => ({ downloadBackup: service.downloadBackup }));

import { MigrationWizard } from "@/components/migration/migration-wizard";

function renderWizard(onOpenChange = vi.fn()) {
  render(<MigrationWizard open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

function seedUploading() {
  act(() => {
    const s = useMigrationStore.getState();
    s.setPhase("uploading");
    s.setTableProgress("prescriptions", { total: 4, uploaded: 4, lastBatchIndex: 0 });
    s.setTableProgress("titrationPlans", { total: 6, uploaded: 2, lastBatchIndex: 0 });
    s.setTableProgress("medicationPhases", { total: 10, uploaded: 0, lastBatchIndex: -1 });
    s.setCurrentTableIndex(1);
  });
}

beforeEach(() => {
  useMigrationStore.getState().reset();
  vi.clearAllMocks();
});
afterEach(() => useMigrationStore.getState().reset());

describe("MigrationWizard", () => {
  it("opens on the backup gate and gates Proceed on the backup", async () => {
    const user = userEvent.setup();
    renderWizard();

    const dialog = screen.getByRole("dialog", { name: "Cloud sync migration" });
    expect(within(dialog).getByRole("heading", { name: "Back up your data" })).toBeInTheDocument();
    const proceed = screen.getByRole("button", { name: "Proceed to Migration" });
    expect(proceed).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /downloaded and saved my backup/i }));
    expect(proceed).toBeEnabled();

    await user.click(proceed);
    expect(service.startMigration).toHaveBeenCalledOnce();
    expect(useMigrationStore.getState().phase).toBe("uploading");
  });

  it("enables Proceed once the backup has downloaded", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Download Backup" }));
    expect(service.downloadBackup).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Proceed to Migration" })).toBeEnabled(),
    );
  });

  it("shows upload progress and per-table detail", async () => {
    const user = userEvent.setup();
    renderWizard();
    seedUploading();

    expect(screen.getByText("Uploading Titration Plans…")).toBeInTheDocument();
    expect(screen.getByText("6 / 20 records (30%)")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Upload progress" })).toHaveAttribute(
      "aria-valuenow",
      "30",
    );
    // The close button is hidden (by CSS) while uploading.
    expect(screen.getByTestId("migration-wizard").className).toContain("[&>button]:hidden");

    const toggle = screen.getByRole("button", { name: /show details/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: /hide details/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    const list = screen.getByTestId("migration-table-list");
    expect(list.querySelector("[data-status]")).toHaveTextContent("Prescriptions4 / 4");
    const statuses = [...list.querySelectorAll("[data-status]")].map((r) =>
      r.getAttribute("data-status"),
    );
    expect(statuses.slice(0, 3)).toEqual(["done", "uploading", "pending"]);
    expect(within(list).getByText("2 / 6")).toHaveClass("font-mono");
    expect(within(list).getByRole("status", { name: "Uploading" })).toBeInTheDocument();
  });

  it("asks before cancelling, and Go Back keeps uploading", async () => {
    const user = userEvent.setup();
    renderWizard();
    seedUploading();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Cancel migration?" });
    await user.click(within(confirm).getByRole("button", { name: "Go Back" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(service.cancelMigration).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Cancel Migration",
      }),
    );
    expect(service.cancelMigration).toHaveBeenCalledOnce();
  });

  it("summarises a completed migration", async () => {
    const user = userEvent.setup();
    const onOpenChange = renderWizard();
    act(() => {
      const s = useMigrationStore.getState();
      s.setTableProgress("prescriptions", { total: 4, uploaded: 4, lastBatchIndex: 0 });
      s.setTableProgress("intakeRecords", { total: 120, uploaded: 120, lastBatchIndex: 0 });
      s.setTableProgress("weightRecords", { total: 0, uploaded: 0, lastBatchIndex: -1 });
      s.setPhase("complete");
    });

    expect(screen.getByRole("heading", { name: "Migration Complete" })).toBeInTheDocument();
    expect(screen.getByText(/records\s+uploaded in/)).toHaveTextContent(
      /^124 records uploaded in \d+s$/,
    );
    expect(screen.getByText("Intake")).toBeInTheDocument();
    expect(screen.getByText("120 records")).toBeInTheDocument();
    expect(screen.queryByText("Weight")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(service.completeMigration).toHaveBeenCalledOnce();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows the error and closes on Close", async () => {
    const user = userEvent.setup();
    const onOpenChange = renderWizard();
    act(() => {
      useMigrationStore.getState().setError("HTTP 500");
      useMigrationStore.getState().setPhase("error");
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Migration Error");
    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 500");
    const closes = screen.getAllByRole("button", { name: "Close" });
    await user.click(closes[0]!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
