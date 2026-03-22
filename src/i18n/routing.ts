import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ko", "es"],
  defaultLocale: "en",
});
