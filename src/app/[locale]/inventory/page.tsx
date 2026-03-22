/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InventoryPage } from "@/components/inventory/inventory-page";

export default async function InventoryRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Get store assignment
  const { data: storeUser } = await supabase
    .from("store_users")
    .select("store_id, role, stores(id, code, name)")
    .eq("user_id", user.id)
    .single();

  if (!storeUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-center">
        <p className="text-muted-foreground">No store assigned. Contact your administrator.</p>
      </div>
    );
  }

  // Buyers/admins → redirect to dashboard
  if (storeUser.role === "buyer" || storeUser.role === "admin") {
    redirect(`/${locale}/dashboard`);
  }

  // Get active products
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  // Get current week submission
  const now = new Date();
  const year = now.getFullYear();
  const week = getISOWeek(now);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = storeUser.stores as any as { id: string; code: string; name: string };

  let { data: submission } = await supabase
    .from("weekly_submissions")
    .select("*")
    .eq("store_id", store.id)
    .eq("year", year)
    .eq("week", week)
    .maybeSingle();

  // Auto-create submission if not exists
  if (!submission) {
    const { data: newSub } = await supabase
      .from("weekly_submissions")
      .insert({ store_id: store.id, year, week, status: "draft" })
      .select()
      .single();
    submission = newSub;
  }

  // Get existing entries
  const { data: entries } = submission
    ? await supabase
        .from("inventory_entries")
        .select("*")
        .eq("submission_id", submission.id)
    : { data: [] };

  return (
    <InventoryPage
      locale={locale}
      store={store}
      year={year}
      week={week}
      submission={submission}
      products={products ?? []}
      entries={entries ?? []}
    />
  );
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
