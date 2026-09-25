import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockUserId = "test-user-123";
const mockRows: Record<string, Record<string, unknown>[]> = {};

vi.mock("@/lib/auth-middleware", () => ({
  withAuth: (handler: (ctx: { request: NextRequest; auth: { success: boolean; userId: string } }) => Promise<Response>) => {
    return async (request: NextRequest) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== "Bearer valid-token") {
        const { NextResponse } = await import("next/server");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return handler({
        request,
        auth: { success: true, userId: mockUserId },
      });
    };
  },
}));

vi.mock("@intake/db/client", () => {
  function getTableName(table: Record<string, unknown>): string {
    return (table._name as string) ?? "unknown";
  }

  const selectProxy = {
    select: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      let tableName = "unknown";
      chain.from = vi.fn((table: Record<string, unknown>) => {
        tableName = getTableName(table);
        const innerChain: Record<string, unknown> = {};
        innerChain.where = vi.fn(() => {
          const whereChain: Record<string, unknown> = {};
          whereChain.orderBy = vi.fn(() => {
            const orderChain: Record<string, unknown> = {};
            orderChain.limit = vi.fn(() => {
              return Promise.resolve(mockRows[tableName] ?? []);
            });
            return orderChain;
          });
          return whereChain;
        });
        return innerChain;
      });
      return chain;
    }),
    delete: vi.fn((table: Record<string, unknown>) => {
      const tableName = getTableName(table);
      const chain: Record<string, unknown> = {};
      chain.where = vi.fn(() => {
        const count = (mockRows[tableName] ?? []).length;
        mockRows[tableName] = [];
        return Promise.resolve({ rowCount: count });
      });
      return chain;
    }),
  };

  return { db: selectProxy };
});

vi.mock("@intake/db/sync-payload", async () => {
  const tableNames = [
    "intakeRecords", "weightRecords", "bloodPressureRecords",
    "eatingRecords", "urinationRecords", "defecationRecords",
    "prescriptions", "medicationPhases", "phaseSchedules",
    "inventoryItems", "inventoryTransactions", "doseLogs",
    "dailyNotes", "auditLogs", "substanceRecords", "titrationPlans",
  ];
  const schemaByTableName: Record<string, { _name: string }> = {};
  for (const name of tableNames) {
    schemaByTableName[name] = { _name: name };
  }
  return { schemaByTableName };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ type: "eq" })),
  gt: vi.fn((_col: unknown, _val: unknown) => ({ type: "gt" })),
  and: vi.fn((..._conditions: unknown[]) => ({ type: "and" })),
}));

beforeEach(() => {
  for (const key of Object.keys(mockRows)) {
    delete mockRows[key];
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest(url: string, auth = true): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (auth) {
    headers["authorization"] = "Bearer valid-token";
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers,
  });
}

describe("cleanup endpoint", () => {
  it("deletes rows from all 16 app tables", async () => {
    mockRows["intakeRecords"] = [{ id: "1", userId: mockUserId }];
    mockRows["weightRecords"] = [{ id: "2", userId: mockUserId }];
    mockRows["prescriptions"] = [{ id: "3", userId: mockUserId }];

    const { POST } = await import("@/app/api/sync/cleanup/route");
    const res = await POST(makeRequest("/api/sync/cleanup"));
    const data = await res.json();

    expect(data.deleted).toBeDefined();
    expect(Object.keys(data.deleted).length).toBe(16);
  });

  it("returns per-table delete counts", async () => {
    mockRows["intakeRecords"] = [
      { id: "1", userId: mockUserId },
      { id: "2", userId: mockUserId },
    ];
    mockRows["weightRecords"] = [{ id: "3", userId: mockUserId }];

    const { POST } = await import("@/app/api/sync/cleanup/route");
    const res = await POST(makeRequest("/api/sync/cleanup"));
    const data = await res.json();

    expect(data.deleted.intakeRecords).toBe(2);
    expect(data.deleted.weightRecords).toBe(1);
  });

  it("returns 401 without auth", async () => {
    const { POST } = await import("@/app/api/sync/cleanup/route");
    const res = await POST(makeRequest("/api/sync/cleanup", false));
    expect(res.status).toBe(401);
  });
});
