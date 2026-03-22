import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Store Inventory",
  description: "Weekly store inventory tracking",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
