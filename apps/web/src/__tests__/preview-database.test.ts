import { afterEach, describe, it, expect, vi } from "vitest";
import Dexie from "dexie";
import { createPreviewDatabase, PREVIEW_DB_PREFIX } from "@/lib/db";

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((d) => d.name ?? "");
}

/** A seeded database some page left open or behind. */
async function sampleDatabase(name: string): Promise<Dexie> {
  const database = new Dexie(name);
  database.version(1).stores({ bloodPressureRecords: "id" });
  await database.table("bloodPressureRecords").add({ id: "old-sample" });
  return database;
}

/** The part of the Web Locks API the sweep uses, shared by every "tab". */
function stubWebLocks(): Set<string> {
  const held = new Set<string>();
  vi.stubGlobal("navigator", {
    locks: {
      request: (name: string, callback: () => Promise<unknown>) => {
        held.add(name);
        return Promise.resolve(callback()).finally(() => held.delete(name));
      },
      query: async () => ({ held: [...held].map((name) => ({ name })), pending: [] }),
    },
  });
  return held;
}

describe("createPreviewDatabase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sweeps the preview databases earlier page loads left behind, but not one another tab is using", async () => {
    const held = stubWebLocks();

    // What a reload used to leave: the old counter-only name, still seeded.
    const leftoverName = `${PREVIEW_DB_PREFIX}1`;
    (await sampleDatabase(leftoverName)).close();
    // A page load that is gone: nothing holds its lock any more.
    const deadName = `${PREVIEW_DB_PREFIX}deadsession-3`;
    (await sampleDatabase(deadName)).close();
    // Another open tab with a demo on screen: connection open, lock held.
    const otherTabName = `${PREVIEW_DB_PREFIX}othertab-2`;
    const otherTab = await sampleDatabase(otherTabName);
    held.add(`${PREVIEW_DB_PREFIX}othertab`);

    const preview = createPreviewDatabase();
    expect(preview.name.startsWith(PREVIEW_DB_PREFIX)).toBe(true);
    expect(preview.name).not.toBe(leftoverName);
    await preview.open();
    expect(await preview.bloodPressureRecords.count()).toBe(0);
    // This page load holds its own lock, so other tabs leave its previews be.
    expect([...held].some((lock) => preview.name.startsWith(`${lock}-`))).toBe(true);

    // The first preview of a page load sweeps the dead ones away...
    await expect.poll(databaseNames).not.toContain(leftoverName);
    await expect.poll(databaseNames).not.toContain(deadName);
    expect(await databaseNames()).toContain(preview.name);
    // ...and leaves the other tab's demo open, with its sample data.
    expect(await databaseNames()).toContain(otherTabName);
    expect(otherTab.isOpen()).toBe(true);
    expect(await otherTab.table("bloodPressureRecords").count()).toBe(1);

    const second = createPreviewDatabase();
    expect(second.name).not.toBe(preview.name);
    otherTab.close();
    await Dexie.delete(otherTabName);
    await preview.delete();
  });
});
