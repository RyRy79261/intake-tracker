/**
 * unwrap() must surface the underlying exception a service caught — not just
 * the generic wrapper string. Issue #287 was undiagnosable because every save
 * failure reached the UI as bare "Failed to add substance record" with the
 * real Dexie error discarded.
 */
import { describe, expect, it } from "vitest";
import { ok, err, unwrap } from "@intake/core/service";
import { isDatabaseClosedError } from "@/lib/db";

describe("unwrap", () => {
  it("returns the data on success", () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it("throws the bare error string when there are no details", () => {
    expect(() => unwrap(err("Failed to add substance record"))).toThrowError(
      /^Failed to add substance record$/,
    );
  });

  it("folds an Error detail into the message and preserves it as cause", () => {
    const dexieError = new Error("Database has been closed");
    dexieError.name = "DatabaseClosedError";

    let thrown: unknown;
    try {
      unwrap(err("Failed to add substance record", dexieError));
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "Failed to add substance record (DatabaseClosedError: Database has been closed)",
    );
    expect((thrown as Error).cause).toBe(dexieError);
  });

  it("stringifies non-Error details into the message", () => {
    expect(() => unwrap(err("Failed to add intake record", "quota hit"))).toThrowError(
      "Failed to add intake record (quota hit)",
    );
  });
});

describe("isDatabaseClosedError", () => {
  it("matches a bare DatabaseClosedError", () => {
    const e = new Error("Database has been closed");
    e.name = "DatabaseClosedError";
    expect(isDatabaseClosedError(e)).toBe(true);
  });

  it("matches through the cause chain built by unwrap", () => {
    const dexieError = new Error("Database has been closed");
    dexieError.name = "DatabaseClosedError";

    let thrown: unknown;
    try {
      unwrap(err("Failed to add substance record", dexieError));
    } catch (e) {
      thrown = e;
    }
    expect(isDatabaseClosedError(thrown)).toBe(true);
  });

  it("rejects unrelated errors and non-errors", () => {
    expect(isDatabaseClosedError(new Error("ConstraintError"))).toBe(false);
    expect(isDatabaseClosedError("DatabaseClosedError")).toBe(false);
    expect(isDatabaseClosedError(undefined)).toBe(false);
  });
});
