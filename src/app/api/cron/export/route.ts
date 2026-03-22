import { NextRequest, NextResponse } from "next/server";

// Vercel Cron — runs every Sunday 23:00 UTC
// vercel.json: { "crons": [{ "path": "/api/cron/export", "schedule": "0 23 * * 0" }] }
//
// This endpoint just triggers a notification / log.
// Actual Excel generation is handled by /api/export (called by the Python script).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const week = getISOWeek(now);
  const year = now.getFullYear();

  // Log cron execution
  console.log(`[CRON] Sunday export triggered — W${week} ${year}`);

  return NextResponse.json({
    ok: true,
    message: `Cron triggered for W${week} ${year}. Use /api/export?secret=... to download.`,
    week,
    year,
    exportUrl: `/api/export?secret=${process.env.EXPORT_SECRET}&year=${year}&week=${week}`,
  });
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
