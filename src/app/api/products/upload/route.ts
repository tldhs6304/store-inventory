import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: storeUser } = await supabase
    .from("store_users")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!storeUser || !["buyer", "admin"].includes(storeUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse file
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  // Map rows to products
  // Expected columns: UPC, Description, Description_KR, Unit, Pack, B1_Code
  const products = rows
    .filter((r) => r["UPC"] || r["upc"])
    .map((r, i) => ({
      upc: String(r["UPC"] ?? r["upc"] ?? "").trim(),
      description: String(r["Description"] ?? r["description"] ?? r["DESCRIPTION"] ?? "").trim(),
      description_kr: String(r["Description_KR"] ?? r["description_kr"] ?? r["한국어"] ?? "").trim() || null,
      b1_code: String(r["B1_Code"] ?? r["b1_code"] ?? r["B1CODE"] ?? "").trim() || null,
      unit: String(r["Unit"] ?? r["unit"] ?? r["UNIT"] ?? "").trim() || null,
      pack: Number(r["Pack"] ?? r["pack"] ?? r["PACK"] ?? 1) || 1,
      sort_order: i,
      active: true,
    }))
    .filter((p) => p.upc && p.description);

  if (products.length === 0) {
    return NextResponse.json({ error: "No valid rows found. Check column names." }, { status: 400 });
  }

  // Deactivate all existing, then upsert new
  await supabase.from("products").update({ active: false }).eq("active", true);

  const { error } = await supabase
    .from("products")
    .upsert(products, { onConflict: "upc" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ count: products.length });
}
