import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

const font = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Instant+ Technical Content Evaluation",
  description: "Enterprise AI evaluation workspace for Instant Plus",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={font.className}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
