"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { LanguageSelector } from "@/components/language-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Database } from "@/types/supabase";

type Product = Database["public"]["Tables"]["products"]["Row"];
type Submission = Database["public"]["Tables"]["weekly_submissions"]["Row"];
type Entry = Database["public"]["Tables"]["inventory_entries"]["Row"];

interface InventoryPageProps {
  locale: string;
  store: { id: string; code: string; name: string };
  year: number;
  week: number;
  submission: Submission | null;
  products: Product[];
  entries: Entry[];
}

type EntryData = { front_qty: number; back_qty: number; order_request: number };
type Entries = Record<string, EntryData>; // product_id → data

export function InventoryPage({
  locale, store, year, week, submission, products, entries,
}: InventoryPageProps) {
  const t = useTranslations();
  const supabase = createClient();

  // Build initial state from server entries
  const initialEntries: Entries = {};
  for (const e of entries) {
    initialEntries[e.product_id] = {
      front_qty: e.front_qty,
      back_qty: e.back_qty,
      order_request: e.order_request,
    };
  }

  const [data, setData] = useState<Entries>(initialEntries);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState(submission?.status === "submitted");
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deadline: Sunday 23:59 of the current week
  const deadline = getSundayDeadline(year, week);
  const timeLeft = getTimeLeft(deadline);

  // Search filter
  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.description.toLowerCase().includes(q) ||
      (p.description_kr ?? "").toLowerCase().includes(q) ||
      p.upc.includes(q)
    );
  });

  // Progress: items with at least one field filled
  const filledCount = products.filter((p) => {
    const e = data[p.id];
    return e && (e.front_qty > 0 || e.back_qty > 0 || e.order_request > 0);
  }).length;

  // Debounced save
  const saveEntry = useCallback(
    async (productId: string, field: keyof EntryData, value: number) => {
      setData((prev) => ({
        ...prev,
        [productId]: { ...(prev[productId] ?? { front_qty: 0, back_qty: 0, order_request: 0 }), [field]: value },
      }));

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (!submission) return;
        setSaving(true);
        const prev = data[productId] ?? { front_qty: 0, back_qty: 0, order_request: 0 };
        const current = { ...prev, [field]: value };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("inventory_entries") as any).upsert(
          { submission_id: submission.id, product_id: productId, ...current },
          { onConflict: "submission_id,product_id" }
        );
        setSaving(false);
        setLastSaved(new Date());
      }, 600);
    },
    [data, submission, supabase]
  );

  async function handleSubmit() {
    if (!submission) return;
    setSaving(true);
    await supabase
      .from("weekly_submissions")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", submission.id);
    setSaving(false);
    setSubmitted(true);
    setShowConfirm(false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="font-bold text-base">{store.code} — {t("inventory.title")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("inventory.week")} {week}, {year}
              {" · "}
              {timeLeft.text}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saving ? (
              <span className="text-xs text-muted-foreground">{t("common.loading")}</span>
            ) : lastSaved ? (
              <span className="text-xs text-muted-foreground">{t("inventory.autoSaved")}</span>
            ) : null}
            <LanguageSelector currentLocale={locale} />
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("inventory.progress", { done: filledCount, total: products.length })}</span>
            {submitted && (
              <Badge variant="default" className="text-xs h-5">
                {t("inventory.submitted")}
              </Badge>
            )}
          </div>
          <Progress value={(filledCount / Math.max(products.length, 1)) * 100} className="h-1.5" />
        </div>

        {/* Search */}
        <div className="mt-2">
          <Input
            placeholder={t("inventory.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-sm"
          />
        </div>
      </header>

      {/* Column headers */}
      <div className="sticky top-[136px] z-10 bg-muted/80 backdrop-blur-sm border-b px-4 py-1.5 grid grid-cols-[1fr_72px_72px_72px] gap-2 text-xs font-medium text-muted-foreground">
        <span>{t("inventory.sections.front")} / {t("inventory.sections.back")} / {t("inventory.sections.order")}</span>
        <span className="text-center">{t("inventory.sections.front")}</span>
        <span className="text-center">{t("inventory.sections.back")}</span>
        <span className="text-center">{t("inventory.sections.order")}</span>
      </div>

      {/* Product list */}
      <main className="flex-1 divide-y">
        {filtered.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("inventory.noProducts")}
          </div>
        )}
        {filtered.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            entry={data[product.id] ?? { front_qty: 0, back_qty: 0, order_request: 0 }}
            locale={locale}
            onChange={saveEntry}
          />
        ))}
      </main>

      {/* Submit button */}
      {!submitted && (
        <div className="sticky bottom-0 bg-background border-t px-4 py-3">
          <Button
            className="w-full h-12 text-base"
            onClick={() => setShowConfirm(true)}
            disabled={saving}
          >
            {t("inventory.submitAll")}
          </Button>
        </div>
      )}

      {submitted && (
        <div className="sticky bottom-0 bg-green-50 border-t border-green-200 px-4 py-3 text-center">
          <p className="text-green-700 font-medium text-sm">{t("inventory.submitted")}</p>
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inventory.submitAll")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("inventory.confirmSubmit", { store: store.code, week })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("inventory.confirmSubmitNote")}
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {t("common.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── ProductRow ────────────────────────────────────────────────────────────────
interface ProductRowProps {
  product: Product;
  entry: EntryData;
  locale: string;
  onChange: (productId: string, field: keyof EntryData, value: number) => void;
}

function ProductRow({ product, entry, locale, onChange }: ProductRowProps) {
  const name = locale === "ko" && product.description_kr
    ? product.description_kr
    : product.description;

  const hasTouched = entry.front_qty > 0 || entry.back_qty > 0 || entry.order_request > 0;

  return (
    <div className={`px-4 py-3 grid grid-cols-[1fr_72px_72px_72px] gap-2 items-center ${hasTouched ? "bg-blue-50/30" : ""}`}>
      {/* Product name */}
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {product.b1_code && <span className="font-mono">{product.b1_code}</span>}
          {product.unit && <span className="ml-1">{product.unit}</span>}
          {product.pack && product.pack !== 1 && <span> ×{product.pack}</span>}
        </p>
      </div>

      {/* Front qty */}
      <QtyInput
        value={entry.front_qty}
        onChange={(v) => onChange(product.id, "front_qty", v)}
      />

      {/* Back qty */}
      <QtyInput
        value={entry.back_qty}
        onChange={(v) => onChange(product.id, "back_qty", v)}
      />

      {/* Order request */}
      <QtyInput
        value={entry.order_request}
        onChange={(v) => onChange(product.id, "order_request", v)}
        highlight
      />
    </div>
  );
}

// ─── QtyInput ─────────────────────────────────────────────────────────────────
interface QtyInputProps {
  value: number;
  onChange: (v: number) => void;
  highlight?: boolean;
}

function QtyInput({ value, onChange, highlight }: QtyInputProps) {
  return (
    <input
      type="number"
      inputMode="numeric"
      pattern="[0-9]*"
      min={0}
      value={value === 0 ? "" : value}
      placeholder="0"
      onChange={(e) => {
        const v = parseFloat(e.target.value) || 0;
        onChange(Math.max(0, v));
      }}
      className={[
        "w-full h-10 rounded-md border text-center text-sm font-mono",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        highlight
          ? "border-orange-300 bg-orange-50 focus:ring-orange-400"
          : "border-input bg-background",
      ].join(" ")}
    />
  );
}

// ─── Deadline helpers ──────────────────────────────────────────────────────────
function getSundayDeadline(year: number, week: number): Date {
  // ISO week starts Monday; Sunday is day 7
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 0);
  return sunday;
}

function getTimeLeft(deadline: Date) {
  const now = Date.now();
  const diff = deadline.getTime() - now;

  if (diff <= 0) return { text: "⏰ Overdue", overdue: true };

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);

  if (days === 0 && hours < 24) {
    return { text: `⚠️ Due in ${hours}h`, overdue: false };
  }
  return { text: `Due in ${days}d ${hours}h`, overdue: false };
}
