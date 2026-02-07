import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { neonDb, userSettings } from "@/lib/neon-db";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  return verifyAndCheckWhitelist(token ?? null);
}

// Syncable settings type (excludes local-only settings like theme, storageMode, API keys)
export interface SyncableSettings {
  waterLimit: number;
  saltLimit: number;
  waterIncrement: number;
  saltIncrement: number;
  dayStartHour: number;
  dataRetentionDays: number;
}

// GET /api/storage/settings - Get user settings
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const result = await neonDb
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, auth.userId))
      .limit(1);

    if (result.length === 0) {
      // Return defaults if no settings exist
      return NextResponse.json({
        waterLimit: 1000,
        saltLimit: 1500,
        waterIncrement: 250,
        saltIncrement: 250,
        dayStartHour: 2,
        dataRetentionDays: 90,
      });
    }

    // Return settings without userId
    const { userId, updatedAt, ...settings } = result[0];
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to get settings:", error);
    return NextResponse.json(
      { error: "Failed to get settings" },
      { status: 500 }
    );
  }
}

// PUT /api/storage/settings - Update user settings
export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      waterLimit,
      saltLimit,
      waterIncrement,
      saltIncrement,
      dayStartHour,
      dataRetentionDays,
    } = body as Partial<SyncableSettings>;

    // Validate inputs
    const settings: Partial<SyncableSettings> = {};
    if (waterLimit !== undefined) {
      if (typeof waterLimit !== "number" || waterLimit < 100 || waterLimit > 10000) {
        return NextResponse.json({ error: "Invalid waterLimit" }, { status: 400 });
      }
      settings.waterLimit = waterLimit;
    }
    if (saltLimit !== undefined) {
      if (typeof saltLimit !== "number" || saltLimit < 100 || saltLimit > 10000) {
        return NextResponse.json({ error: "Invalid saltLimit" }, { status: 400 });
      }
      settings.saltLimit = saltLimit;
    }
    if (waterIncrement !== undefined) {
      if (typeof waterIncrement !== "number" || waterIncrement < 10 || waterIncrement > 1000) {
        return NextResponse.json({ error: "Invalid waterIncrement" }, { status: 400 });
      }
      settings.waterIncrement = waterIncrement;
    }
    if (saltIncrement !== undefined) {
      if (typeof saltIncrement !== "number" || saltIncrement < 10 || saltIncrement > 1000) {
        return NextResponse.json({ error: "Invalid saltIncrement" }, { status: 400 });
      }
      settings.saltIncrement = saltIncrement;
    }
    if (dayStartHour !== undefined) {
      if (typeof dayStartHour !== "number" || dayStartHour < 0 || dayStartHour > 23) {
        return NextResponse.json({ error: "Invalid dayStartHour" }, { status: 400 });
      }
      settings.dayStartHour = dayStartHour;
    }
    if (dataRetentionDays !== undefined) {
      if (typeof dataRetentionDays !== "number" || dataRetentionDays < 0 || dataRetentionDays > 365) {
        return NextResponse.json({ error: "Invalid dataRetentionDays" }, { status: 400 });
      }
      settings.dataRetentionDays = dataRetentionDays;
    }

    if (Object.keys(settings).length === 0) {
      return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });
    }

    // Upsert settings
    const now = Date.now();
    
    // Check if settings exist
    const existing = await neonDb
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, auth.userId))
      .limit(1);

    if (existing.length === 0) {
      // Insert new settings with defaults
      await neonDb.insert(userSettings).values({
        userId: auth.userId,
        waterLimit: settings.waterLimit ?? 1000,
        saltLimit: settings.saltLimit ?? 1500,
        waterIncrement: settings.waterIncrement ?? 250,
        saltIncrement: settings.saltIncrement ?? 250,
        dayStartHour: settings.dayStartHour ?? 2,
        dataRetentionDays: settings.dataRetentionDays ?? 90,
        updatedAt: now,
      });
    } else {
      // Update existing settings
      await neonDb
        .update(userSettings)
        .set({ ...settings, updatedAt: now })
        .where(eq(userSettings.userId, auth.userId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
