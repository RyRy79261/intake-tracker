import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { getSettings, saveSettings } from "@/lib/push-db";

const SettingsSchema = z.object({
  followUpCount: z.number().int().min(0).max(10),
  followUpIntervalMinutes: z.number().int().min(1).max(60),
  // The user's logical day boundary (settings-store dayStartHour). Optional so
  // an older client that does not send it keeps the stored value.
  dayStartHour: z.number().int().min(0).max(23).optional(),
});

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const body = await request.json();

    const parsed = SettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: z.flattenError(parsed.error) },
        { status: 400 }
      );
    }

    const dayStartHour =
      parsed.data.dayStartHour ?? (await getSettings(auth.userId!)).dayStartHour;

    await saveSettings(auth.userId!, {
      enabled: true,
      followUpCount: parsed.data.followUpCount,
      followUpIntervalMinutes: parsed.data.followUpIntervalMinutes,
      dayStartHour,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[push/settings] Error:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
});
