import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth-middleware";
import { saveSettings } from "@/lib/push-db";

const SettingsSchema = z.object({
  followUpCount: z.number().int().min(0).max(10),
  followUpIntervalMinutes: z.number().int().min(1).max(60),
});

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const body = await request.json();

    const parsed = SettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await saveSettings(auth.userId!, {
      enabled: true,
      followUpCount: parsed.data.followUpCount,
      followUpIntervalMinutes: parsed.data.followUpIntervalMinutes,
      dayStartHour: 2,
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
