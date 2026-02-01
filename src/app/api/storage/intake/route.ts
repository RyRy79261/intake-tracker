import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { neonDb, intakeRecords } from "@/lib/neon-db";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";
import { generateId } from "@/lib/utils";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  return verifyAndCheckWhitelist(token ?? null);
}

// GET /api/storage/intake - Get intake records
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as "water" | "salt" | null;
  const timeRange = searchParams.get("timeRange");
  const startTime = searchParams.get("startTime");
  const endTime = searchParams.get("endTime");
  const all = searchParams.get("all") === "true";

  try {
    let conditions = [eq(intakeRecords.userId, auth.userId)];

    if (type) {
      conditions.push(eq(intakeRecords.type, type));
    }

    if (timeRange === "24h") {
      const cutoff = Date.now() - TWENTY_FOUR_HOURS_MS;
      conditions.push(gte(intakeRecords.timestamp, cutoff));
    } else if (startTime && endTime) {
      conditions.push(gte(intakeRecords.timestamp, parseInt(startTime)));
      conditions.push(lte(intakeRecords.timestamp, parseInt(endTime)));
    }

    const records = await neonDb
      .select()
      .from(intakeRecords)
      .where(and(...conditions))
      .orderBy(desc(intakeRecords.timestamp));

    // Map to local format (without userId)
    const mappedRecords = records.map(({ userId, ...record }) => record);

    return NextResponse.json(mappedRecords);
  } catch (error) {
    console.error("Failed to get intake records:", error);
    return NextResponse.json(
      { error: "Failed to get records" },
      { status: 500 }
    );
  }
}

// POST /api/storage/intake - Create intake record
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, amount, source, timestamp, note } = body;

    if (!type || !["water", "salt"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const id = generateId();
    const record = {
      id,
      userId: auth.userId,
      type: type as "water" | "salt",
      amount,
      timestamp: timestamp ?? Date.now(),
      source: source ?? "manual",
      note: note?.trim() || null,
    };

    await neonDb.insert(intakeRecords).values(record);

    // Return without userId
    const { userId, ...response } = record;
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to create intake record:", error);
    return NextResponse.json(
      { error: "Failed to create record" },
      { status: 500 }
    );
  }
}
