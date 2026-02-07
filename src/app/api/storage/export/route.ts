import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { neonDb, intakeRecords, weightRecords, bloodPressureRecords } from "@/lib/neon-db";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";
import { generateId } from "@/lib/utils";

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  return verifyAndCheckWhitelist(token ?? null);
}

// GET /api/storage/export - Export all data for the user
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    // Fetch all records for the user
    const [intake, weight, bloodPressure] = await Promise.all([
      neonDb
        .select()
        .from(intakeRecords)
        .where(eq(intakeRecords.userId, auth.userId))
        .orderBy(desc(intakeRecords.timestamp)),
      neonDb
        .select()
        .from(weightRecords)
        .where(eq(weightRecords.userId, auth.userId))
        .orderBy(desc(weightRecords.timestamp)),
      neonDb
        .select()
        .from(bloodPressureRecords)
        .where(eq(bloodPressureRecords.userId, auth.userId))
        .orderBy(desc(bloodPressureRecords.timestamp)),
    ]);

    // Map to local format (without userId)
    const exportData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      intakeRecords: intake.map(({ userId, ...record }) => record),
      weightRecords: weight.map(({ userId, ...record }) => record),
      bloodPressureRecords: bloodPressure.map(({ userId, ...record }) => record),
    };

    return NextResponse.json(exportData);
  } catch (error) {
    console.error("Failed to export data:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}

// POST /api/storage/export - Import data to server
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { data, mode = "merge" } = body;

    if (!data || !data.intakeRecords) {
      return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;

    // If replace mode, clear existing data
    if (mode === "replace") {
      await Promise.all([
        neonDb.delete(intakeRecords).where(eq(intakeRecords.userId, auth.userId)),
        neonDb.delete(weightRecords).where(eq(weightRecords.userId, auth.userId)),
        neonDb.delete(bloodPressureRecords).where(eq(bloodPressureRecords.userId, auth.userId)),
      ]);
    }

    // Import intake records
    for (const record of data.intakeRecords || []) {
      try {
        // Check if record exists (for merge mode)
        if (mode === "merge") {
          const existing = await neonDb
            .select()
            .from(intakeRecords)
            .where(eq(intakeRecords.id, record.id))
            .limit(1);

          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }

        await neonDb.insert(intakeRecords).values({
          id: record.id || generateId(),
          userId: auth.userId,
          type: record.type,
          amount: record.amount,
          timestamp: record.timestamp,
          source: record.source || null,
          note: record.note || null,
        });
        imported++;
      } catch (error) {
        console.error("Failed to import intake record:", error);
        skipped++;
      }
    }

    // Import weight records
    for (const record of data.weightRecords || []) {
      try {
        if (mode === "merge") {
          const existing = await neonDb
            .select()
            .from(weightRecords)
            .where(eq(weightRecords.id, record.id))
            .limit(1);

          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }

        await neonDb.insert(weightRecords).values({
          id: record.id || generateId(),
          userId: auth.userId,
          weight: record.weight,
          timestamp: record.timestamp,
          note: record.note || null,
        });
        imported++;
      } catch (error) {
        console.error("Failed to import weight record:", error);
        skipped++;
      }
    }

    // Import blood pressure records
    for (const record of data.bloodPressureRecords || []) {
      try {
        if (mode === "merge") {
          const existing = await neonDb
            .select()
            .from(bloodPressureRecords)
            .where(eq(bloodPressureRecords.id, record.id))
            .limit(1);

          if (existing.length > 0) {
            skipped++;
            continue;
          }
        }

        await neonDb.insert(bloodPressureRecords).values({
          id: record.id || generateId(),
          userId: auth.userId,
          systolic: record.systolic,
          diastolic: record.diastolic,
          heartRate: record.heartRate || null,
          position: record.position,
          arm: record.arm,
          timestamp: record.timestamp,
          note: record.note || null,
        });
        imported++;
      } catch (error) {
        console.error("Failed to import blood pressure record:", error);
        skipped++;
      }
    }

    return NextResponse.json({ imported, skipped });
  } catch (error) {
    console.error("Failed to import data:", error);
    return NextResponse.json(
      { error: "Failed to import data" },
      { status: 500 }
    );
  }
}
