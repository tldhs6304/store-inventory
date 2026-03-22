"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSelector } from "@/components/language-selector";

interface LoginFormProps {
  locale: string;
}

export function LoginForm({ locale }: LoginFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(t("auth.invalidCredentials"));
      setLoading(false);
      return;
    }

    // Check user role to redirect appropriately
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: storeUser } = await supabase
        .from("store_users")
        .select("role")
        .eq("user_id", user.id)
        .single();

      const role = storeUser?.role;
      if (role === "buyer" || role === "admin") {
        router.push(`/${locale}/dashboard`);
      } else {
        router.push(`/${locale}/inventory`);
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {/* Language selector — top right */}
      <div className="absolute top-4 right-4">
        <LanguageSelector currentLocale={locale} />
      </div>

      <div className="w-full max-w-sm space-y-8">
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <div className="text-4xl">🥦</div>
          <h1 className="text-2xl font-bold tracking-tight">{t("auth.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("auth.subtitle")}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="store@hmart.com"
              required
              autoComplete="email"
              className="h-12 text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="h-12 text-base"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full h-12 text-base"
            disabled={loading}
          >
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>
      </div>
    </div>
  );
}
