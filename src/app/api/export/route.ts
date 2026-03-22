import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Secret key auth (for cron/automated calls) OR session auth
  const secret = searchParams.get("secret");
  const validSecret = process.env.EXPORT_SECRET;
  let supabase;

  if (secret && secret === validSecret) {
    // Use service role key to bypass RLS
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  } else {
    // Session auth
    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: storeUser } = await supabase
      .from("store_users")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!storeUser || !["buyer", "admin"].includes(storeUser.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Parse week/year from query params (default: current)
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const week = parseInt(searchParams.get("week") ?? String(getISOWeek(new Date())));

  // Fetch all stores (ordered)
  const { data: stores } = await supabase
    .from("stores")
    .select("id, code, name")
    .eq("active", true)
    .order("code") as { data: { id: string; code: string; name: string }[] | null };

  // Fetch all active products (ordered)
  const { data: products } = await supabase
    .from("products")
    .select("id, b1_code, description, sort_order")
    .eq("active", true)
    .order("sort_order") as { data: { id: string; b1_code: string | null; description: string; sort_order: number }[] | null };

  // Fetch all submissions for this week
  const { data: submissions } = await supabase
    .from("weekly_submissions")
    .select("id, store_id")
    .eq("year", year)
    .eq("week", week) as { data: { id: string; store_id: string }[] | null };

  const submissionIds = (submissions ?? []).map((s) => s.id);
  const storeBySubmission = Object.fromEntries(
    (submissions ?? []).map((s) => [s.id, s.store_id])
  );

  // Fetch all entries for this week
  let entries: { submission_id: string; product_id: string; front_qty: number; back_qty: number; order_request: number }[] = [];
  if (submissionIds.length > 0) {
    const { data } = await supabase
      .from("inventory_entries")
      .select("submission_id, product_id, front_qty, back_qty, order_request")
      .in("submission_id", submissionIds) as { data: typeof entries | null };
    entries = data ?? [];
  }

  // Build lookup: storeId → productId → { front, back, order }
  type EntryVal = { front: number; back: number; order: number };
  const lookup: Record<string, Record<string, EntryVal>> = {};
  for (const e of entries) {
    const storeId = storeBySubmission[e.submission_id];
    if (!storeId) continue;
    if (!lookup[storeId]) lookup[storeId] = {};
    lookup[storeId][e.product_id] = {
      front: e.front_qty,
      back: e.back_qty,
      order: e.order_request,
    };
  }

  const storeList = stores ?? [];
  const productList = products ?? [];

  // ── Sheet 1: Inventory (front + back) ──────────────────────────────
  const invHeader = ["B1_CODE", "DESCRIPTION", ...storeList.map((s) => s.code)];
  const invRows = productList.map((p) => {
    const row: (string | number)[] = [p.b1_code ?? "", p.description];
    for (const store of storeList) {
      const e = lookup[store.id]?.[p.id];
      row.push(e ? (e.front + e.back) : 0);
    }
    return row;
  });

  // ── Sheet 2: Order Request ──────────────────────────────────────────
  const ordHeader = ["B1_CODE", "DESCRIPTION", ...storeList.map((s) => s.code)];
  const ordRows = productList.map((p) => {
    const row: (string | number)[] = [p.b1_code ?? "", p.description];
    for (const store of storeList) {
      const e = lookup[store.id]?.[p.id];
      row.push(e ? e.order : 0);
    }
    return row;
  });

  // ── Sheet 3: Front only ─────────────────────────────────────────────
  const frontRows = productList.map((p) => {
    const row: (string | number)[] = [p.b1_code ?? "", p.description];
    for (const store of storeList) {
      const e = lookup[store.id]?.[p.id];
      row.push(e ? e.front : 0);
    }
    return row;
  });

  // ── Sheet 4: Back only ──────────────────────────────────────────────
  const backRows = productList.map((p) => {
    const row: (string | number)[] = [p.b1_code ?? "", p.description];
    for (const store of storeList) {
      const e = lookup[store.id]?.[p.id];
      row.push(e ? e.back : 0);
    }
    return row;
  });

  // Build workbook
  const wb = XLSX.utils.book_new();

  const wsInv = XLSX.utils.aoa_to_sheet([invHeader, ...invRows]);
  styleSheet(wsInv, storeList.length);
  XLSX.utils.book_append_sheet(wb, wsInv, `Inventory W${week}`);

  const wsOrd = XLSX.utils.aoa_to_sheet([ordHeader, ...ordRows]);
  styleSheet(wsOrd, storeList.length);
  XLSX.utils.book_append_sheet(wb, wsOrd, `Order Request W${week}`);

  const wsFront = XLSX.utils.aoa_to_sheet([invHeader, ...frontRows]);
  styleSheet(wsFront, storeList.length);
  XLSX.utils.book_append_sheet(wb, wsFront, "Front");

  const wsBack = XLSX.utils.aoa_to_sheet([ordHeader, ...backRows]);
  styleSheet(wsBack, storeList.length);
  XLSX.utils.book_append_sheet(wb, wsBack, "Back");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Inventory_W${week}_${year}.xlsx"`,
    },
  });
}

function styleSheet(ws: XLSX.WorkSheet, storeCount: number) {
  // Set column widths: A=14, B=28, rest=8
  ws["!cols"] = [
    { wch: 14 },
    { wch: 28 },
    ...Array(storeCount).fill({ wch: 8 }),
  ];
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
