import { describe, it, expect } from "vitest";
import Dexie from "dexie";
import { createPreviewDatabase, PREVIEW_DB_PREFIX } from "@/lib/db";

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((d) => d.name ?? "");
}

describe("createPreviewDatabase", () => {
  it("never reopens a preview database an earlier page load left behind", async () => {
    // What a reload used to leave: the old counter-only name, still seeded.
    const leftoverName = `${PREVIEW_DB_PREFIX}1`;
    const leftover = new Dexie(leftoverName);
    leftover.version(1).stores({ bloodPressureRecords: "id" });
    await leftover.table("bloodPressureRecords").add({ id: "old-sample" });
    leftover.close();

    const preview = createPreviewDatabase();
    expect(preview.name.startsWith(PREVIEW_DB_PREFIX)).toBe(true);
    expect(preview.name).not.toBe(leftoverName);
    await preview.open();
    expect(await preview.bloodPressureRecords.count()).toBe(0);

    // The first preview of a page load also sweeps the stale ones away.
    await expect.poll(databaseNames).not.toContain(leftoverName);
    expect(await databaseNames()).toContain(preview.name);

    const second = createPreviewDatabase();
    expect(second.name).not.toBe(preview.name);
    await preview.delete();
  });
});
