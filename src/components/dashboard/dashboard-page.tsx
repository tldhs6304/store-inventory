"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LanguageSelector } from "@/components/language-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Store { id: string; code: string; name: string }
interface Submission { id: string; store_id: string; status: string; submitted_at: string | null; created_at: string }

interface DashboardPageProps {
  locale: string;
  year: number;
  week: number;
  stores: Store[];
  submissions: Submission[];
}

export function DashboardPage({ locale, year, week, stores, submissions }: DashboardPageProps) {
  const t = useTranslations();
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleExcelDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/export?year=${year}&week=${week}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Inventory_W${week}_${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed.");
    } finally {
      setDownloading(false);
    }
  }

  const subMap = new Map(submissions.map((s) => [s.store_id, s]));

  const submitted = stores.filter((s) => subMap.get(s.id)?.status === "submitted");
  const inProgress = stores.filter((s) => {
    const sub = subMap.get(s.id);
    return sub && sub.status === "draft";
  });
  const notStarted = stores.filter((s) => !subMap.has(s.id));

  const submittedPct = Math.round((submitted.length / Math.max(stores.length, 1)) * 100);

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/products/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { count } = await res.json();
      alert(`${count} products imported successfully`);
      window.location.reload();
    } catch {
      alert("Upload failed. Please check the file format.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-background max-w-2xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-base">{t("dashboard.title")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.week", { week })} · {year}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExcelDownload}
              disabled={downloading}
              className="text-xs h-8"
            >
              {downloading ? "..." : "⬇ Excel"}
            </Button>
            <LanguageSelector currentLocale={locale} />
          </div>
        </div>

        {/* Overall progress */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{submitted.length} / {stores.length} {t("dashboard.submitted")}</span>
            <span>{submittedPct}%</span>
          </div>
          <Progress value={submittedPct} className="h-2" />
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label={t("dashboard.submitted")}
            count={submitted.length}
            color="green"
          />
          <StatCard
            label={t("dashboard.pending")}
            count={inProgress.length}
            color="yellow"
          />
          <StatCard
            label={t("dashboard.notStarted")}
            count={notStarted.length}
            color="gray"
          />
        </div>

        {/* Store status list */}
        <section>
          <h2 className="text-sm font-semibold mb-2">{t("dashboard.storeStatus")}</h2>
          <div className="rounded-lg border divide-y">
            {stores.map((store) => {
              const sub = subMap.get(store.id);
              const status = sub?.status ?? "not_started";
              return (
                <div key={store.id} className="flex items-center justify-between px-3 py-2.5">
                  <div>
                    <span className="font-mono text-sm font-medium">{store.code}</span>
                    <span className="text-xs text-muted-foreground ml-2">{store.name}</span>
                  </div>
                  <StatusBadge status={status} submittedAt={sub?.submitted_at ?? null} t={t} />
                </div>
              );
            })}
          </div>
        </section>

        {/* Product upload */}
        <section className="border rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold">Product List Upload</h2>
          <p className="text-xs text-muted-foreground">
            Upload an Excel file (.xlsx) to replace the current product list.
            Required columns: UPC, Description, Description_KR (optional), Unit, Pack
          </p>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                asChild
              >
                <span>{uploading ? "Uploading..." : "Choose Excel file"}</span>
              </Button>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleExcelUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  const colors: Record<string, string> = {
    green: "bg-green-50 border-green-200 text-green-700",
    yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
    gray: "bg-gray-50 border-gray-200 text-gray-600",
  };
  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color] ?? colors.gray}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs mt-0.5">{label}</p>
    </div>
  );
}

function StatusBadge({
  status,
  submittedAt,
  t,
}: {
  status: string;
  submittedAt: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (status === "submitted") {
    const time = submittedAt
      ? new Date(submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    return (
      <div className="text-right">
        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
          {t("dashboard.submitted")}
        </Badge>
        {time && <p className="text-xs text-muted-foreground mt-0.5">{time}</p>}
      </div>
    );
  }
  if (status === "draft") {
    return (
      <Badge variant="outline" className="text-yellow-600 border-yellow-300 text-xs">
        {t("dashboard.pending")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground text-xs">
      {t("dashboard.notStarted")}
    </Badge>
  );
}
