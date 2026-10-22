import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "なすびコーチ",
  description: "自分で決めたことを、毎日続けるための記録とコーチ",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "なすびコーチ", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#fbf9fc",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
