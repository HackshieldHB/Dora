import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionWatch } from "@/components/session-watch";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = { title: "DORA", description: "Digital Organization & Resource Assistant" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get("dora_lang")?.value === "id" ? "id" : "en";
  return (
    <html lang={lang} className={sans.variable}>
      <body className={sans.className}>{children}<SessionWatch /></body>
    </html>
  );
}
