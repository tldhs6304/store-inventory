import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import * as XLSX from "xlsx";

// Vercel Cron — runs every Sunday 23:00 UTC
// Triggered by vercel.json cron schedule
export async function GET(req: NextRequest) {
  // Vercel cron auth header
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role to bypass RLS
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const now = new Date();
  const year = now.getFullYear();
  const week = getISOWeek(now);

  // Fetch data
  const [{ data: stores }, { data: products }, { data: submissions }] = await Promise.all([
    supabase.from("stores").select("id, code").eq("active", true).order("code"),
    supabase.from("products").select("id, b1_code, description, sort_order").eq("active", true).order("sort_order"),
    supabase.from("weekly_submissions").select("id, store_id").eq("year", year).eq("week", week),
  ]);

  const submissionIds = (submissions ?? []).map((s: { id: string }) => s.id);
  const storeBySubmission = Object.fromEntries(
    (submissions ?? []).map((s: { id: string; store_id: string }) => [s.id, s.store_id])
  );

  let entries: { submission_id: string; product_id: string; front_qty: number; back_qty: number; order_request: number }[] = [];
  if (submissionIds.length > 0) {
    const { data } = await supabase
      .from("inventory_entries")
      .select("submission_id, product_id, front_qty, back_qty, order_request")
      .in("submission_id", submissionIds);
    entries = data ?? [];
  }

  type EntryVal = { front: number; back: number; order: number };
  const lookup: Record<string, Record<string, EntryVal>> = {};
  for (const e of entries) {
    const storeId = storeBySubmission[e.submission_id];
    if (!storeId) continue;
    if (!lookup[storeId]) lookup[storeId] = {};
    lookup[storeId][e.product_id] = { front: e.front_qty, back: e.back_qty, order: e.order_request };
  }

  const storeList = stores ?? [];
  const productList = products ?? [];

  const header = ["B1_CODE", "DESCRIPTION", ...storeList.map((s: { code: string }) => s.code)];

  function buildRows(field: "inv" | "order" | "front" | "back") {
    return productList.map((p: { id: string; b1_code: string | null; description: string }) => {
      const row: (string | number)[] = [p.b1_code ?? "", p.description];
      for (const store of storeList as { id: string; code: string }[]) {
        const e = lookup[store.id]?.[p.id];
        if (!e) { row.push(0); continue; }
        row.push(field === "inv" ? e.front + e.back : field === "order" ? e.order : field === "front" ? e.front : e.back);
      }
      return row;
    });
  }

  const wb = XLSX.utils.book_new();
  const cols = [{ wch: 14 }, { wch: 28 }, ...Array(storeList.length).fill({ wch: 8 })];

  for (const [name, field] of [["Inventory", "inv"], ["Order Request", "order"], ["Front", "front"], ["Back", "back"]] as const) {
    const ws = XLSX.utils.aoa_to_sheet([header, ...buildRows(field)]);
    ws["!cols"] = cols;
    XLSX.utils.book_append_sheet(wb, ws, `${name} W${week}`);
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  // Save to Supabase Storage
  const filename = `Inventory_W${week}_${year}.xlsx`;
  await supabase.storage
    .from("exports")
    .upload(filename, buf, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });

  // Get public URL
  const { data: urlData } = supabase.storage.from("exports").getPublicUrl(filename);

  return NextResponse.json({
    ok: true,
    week,
    year,
    file: filename,
    url: urlData.publicUrl,
  });
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
