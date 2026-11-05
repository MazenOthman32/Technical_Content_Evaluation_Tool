import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "تقارير السيشنات",
  description: "مراجعات السيشنات المحفوظة على Supabase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
