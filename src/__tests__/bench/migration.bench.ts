import "fake-indexeddb/auto";
import { bench, describe, afterEach } from "vitest";
import { db } from "@/lib/db";

describe("migration chain v10-v15", () => {
  afterEach(async () => {
    await db.close();
    await db.delete();
  });

  bench(
    "full migration chain: open db at v10 then upgrade to v15",
    async () => {
      // Delete any existing database to force fresh migration
      await db.close();
      await db.delete();

      // Seed at v10 level (IDB version 100) -- minimal store creation
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("IntakeTrackerDB", 100);
        request.onupgradeneeded = (event) => {
          const rawDb = (event.target as IDBOpenDBRequest).result;
          if (!rawDb.objectStoreNames.contains("intakeRecords")) {
            rawDb.createObjectStore("intakeRecords", { keyPath: "id" });
          }
        };
        request.onsuccess = (event) => {
          (event.target as IDBOpenDBRequest).result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });

      // Open via db.ts -- triggers full migration chain v10 -> v15
      await db.open();
      await db.close();
    },
    { time: 2000, iterations: 5, warmupIterations: 1 }
  );
});
