import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { makeIntakeRecord } from "@/__tests__/fixtures/db-fixtures";
import {
  withDbRecovery,
  reportSaveError,
  getBufferedSaveErrors,
  clearBufferedSaveErrors,
} from "@/lib/db-recovery";

// Setup is handled by src/__tests__/setup.ts (fake-indexeddb, db.delete/open per test)

describe("withDbRecovery", () => {
  beforeEach(() => {
    clearBufferedSaveErrors();
  });

  it("reopens a severed database and retries the write once", async () => {
    // db.close() leaves Dexie rejecting every operation with
    // DatabaseClosedError until open() is called — the #287 state.
    db.close();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const id = await withDbRecovery(() =>
      db.intakeRecords.add(makeIntakeRecord({ id: "after-sever" })),
    );

    expect(id).toBe("after-sever");
    expect(db.isOpen()).toBe(true);
    expect(await db.intakeRecords.get("after-sever")).toBeDefined();
    warn.mockRestore();
  });

  it("rethrows errors that are not DatabaseClosedError without retrying", async () => {
    const write = vi.fn().mockRejectedValue(new Error("ConstraintError"));
    await expect(withDbRecovery(write)).rejects.toThrow("ConstraintError");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("re-logs buffered save errors once the connection is recovered", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const closed = new Error("Database has been closed");
    closed.name = "DatabaseClosedError";
    reportSaveError("water", new Error("Failed to add intake record", { cause: closed }));
    expect(getBufferedSaveErrors()).toHaveLength(1);

    db.close();
    await withDbRecovery(() => db.intakeRecords.count());

    expect(getBufferedSaveErrors()).toHaveLength(0);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("earlier failure"),
    );
    error.mockRestore();
    warn.mockRestore();
  });

  it("does not buffer failures unrelated to a closed database", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    reportSaveError("water", new Error("ConstraintError"));

    // Already persisted by the error-log pipeline; buffering it would only
    // log it a second time after the next recovery.
    expect(getBufferedSaveErrors()).toHaveLength(0);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
