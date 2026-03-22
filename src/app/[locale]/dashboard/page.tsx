/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardPage } from "@/components/dashboard/dashboard-page";

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export default async function DashboardRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: storeUser } = await supabase
    .from("store_users")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!storeUser || storeUser.role === "manager") {
    redirect(`/${locale}/inventory`);
  }

  const now = new Date();
  const year = now.getFullYear();
  const week = getISOWeek(now);

  // All stores with their submission status for current week
  const { data: stores } = await supabase
    .from("stores")
    .select("id, code, name")
    .eq("active", true)
    .order("code");

  const { data: submissions } = await supabase
    .from("weekly_submissions")
    .select("id, store_id, status, submitted_at, created_at")
    .eq("year", year)
    .eq("week", week);

  return (
    <DashboardPage
      locale={locale}
      year={year}
      week={week}
      stores={stores ?? []}
      submissions={submissions ?? []}
    />
  );
}
