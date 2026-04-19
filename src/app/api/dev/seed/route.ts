import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import * as fs from "fs";
import * as path from "path";

export const POST = withAuth(async () => {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const fixturePath = path.resolve(
    process.cwd(),
    ".private-fixtures/intake-tracker-backup-2026-04-17.json",
  );

  if (!fs.existsSync(fixturePath)) {
    return NextResponse.json(
      { error: "Fixture file not found", path: fixturePath },
      { status: 404 },
    );
  }

  const data = fs.readFileSync(fixturePath, "utf-8");
  const parsed = JSON.parse(data);

  const records = parsed?.records ?? parsed?.intakeRecords;
  return NextResponse.json({
    ok: true,
    recordCount: Array.isArray(records) ? records.length : 0,
    data: parsed,
  });
});
