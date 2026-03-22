"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const LOCALES = [
  { code: "en", label: "EN" },
  { code: "ko", label: "한" },
  { code: "es", label: "ES" },
] as const;

interface LanguageSelectorProps {
  currentLocale: string;
}

export function LanguageSelector({ currentLocale }: LanguageSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(locale: string) {
    // Replace locale prefix in current path
    const segments = pathname.split("/");
    segments[1] = locale;
    router.push(segments.join("/"));
  }

  return (
    <div className="flex gap-1">
      {LOCALES.map(({ code, label }) => (
        <Button
          key={code}
          variant={currentLocale === code ? "default" : "outline"}
          size="sm"
          className="h-8 w-10 text-xs px-0"
          onClick={() => switchLocale(code)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
