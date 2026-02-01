import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { neonDb, weightRecords } from "@/lib/neon-db";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";
import { generateId } from "@/lib/utils";

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  return verifyAndCheckWhitelist(token ?? null);
}

// GET /api/storage/weight - Get weight records
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");

  try {
    let query = neonDb
      .select()
      .from(weightRecords)
      .where(eq(weightRecords.userId, auth.userId))
      .orderBy(desc(weightRecords.timestamp));

    if (limit) {
      query = query.limit(parseInt(limit)) as typeof query;
    }

    const records = await query;

    // Map to local format (without userId)
    const mappedRecords = records.map(({ userId, ...record }) => record);

    return NextResponse.json(mappedRecords);
  } catch (error) {
    console.error("Failed to get weight records:", error);
    return NextResponse.json(
      { error: "Failed to get records" },
      { status: 500 }
    );
  }
}

// POST /api/storage/weight - Create weight record
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { weight, timestamp, note } = body;

    if (typeof weight !== "number" || weight <= 0) {
      return NextResponse.json({ error: "Invalid weight" }, { status: 400 });
    }

    const id = generateId();
    const record = {
      id,
      userId: auth.userId,
      weight,
      timestamp: timestamp ?? Date.now(),
      note: note?.trim() || null,
    };

    await neonDb.insert(weightRecords).values(record);

    // Return without userId
    const { userId, ...response } = record;
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to create weight record:", error);
    return NextResponse.json(
      { error: "Failed to create record" },
      { status: 500 }
    );
  }
}
