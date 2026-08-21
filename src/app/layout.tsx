import type { Metadata } from "next";
import { Vazirmatn, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const vazir = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazir",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Liara Copilot — دستیار هوشمند لیارا",
  description:
    "دستیار هوش مصنوعی برای استقرار، پیکربندی و عیب‌یابی برنامه‌ها روی ابر لیارا، مبتنی بر مستندات رسمی.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={`${vazir.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <div className="cosmos" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
