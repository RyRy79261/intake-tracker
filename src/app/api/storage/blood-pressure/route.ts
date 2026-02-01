import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { neonDb, bloodPressureRecords } from "@/lib/neon-db";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";
import { generateId } from "@/lib/utils";

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  return verifyAndCheckWhitelist(token ?? null);
}

// GET /api/storage/blood-pressure - Get blood pressure records
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
      .from(bloodPressureRecords)
      .where(eq(bloodPressureRecords.userId, auth.userId))
      .orderBy(desc(bloodPressureRecords.timestamp));

    if (limit) {
      query = query.limit(parseInt(limit)) as typeof query;
    }

    const records = await query;

    // Map to local format (without userId, rename heartRate)
    const mappedRecords = records.map(({ userId, ...record }) => record);

    return NextResponse.json(mappedRecords);
  } catch (error) {
    console.error("Failed to get blood pressure records:", error);
    return NextResponse.json(
      { error: "Failed to get records" },
      { status: 500 }
    );
  }
}

// POST /api/storage/blood-pressure - Create blood pressure record
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { systolic, diastolic, position, arm, heartRate, timestamp, note } = body;

    if (typeof systolic !== "number" || systolic <= 0) {
      return NextResponse.json({ error: "Invalid systolic" }, { status: 400 });
    }

    if (typeof diastolic !== "number" || diastolic <= 0) {
      return NextResponse.json({ error: "Invalid diastolic" }, { status: 400 });
    }

    if (!["standing", "sitting"].includes(position)) {
      return NextResponse.json({ error: "Invalid position" }, { status: 400 });
    }

    if (!["left", "right"].includes(arm)) {
      return NextResponse.json({ error: "Invalid arm" }, { status: 400 });
    }

    const id = generateId();
    const record = {
      id,
      userId: auth.userId,
      systolic,
      diastolic,
      heartRate: heartRate ?? null,
      position: position as "standing" | "sitting",
      arm: arm as "left" | "right",
      timestamp: timestamp ?? Date.now(),
      note: note?.trim() || null,
    };

    await neonDb.insert(bloodPressureRecords).values(record);

    // Return without userId
    const { userId, ...response } = record;
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to create blood pressure record:", error);
    return NextResponse.json(
      { error: "Failed to create record" },
      { status: 500 }
    );
  }
}
