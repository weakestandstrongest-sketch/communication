import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { Splash } from "@/components/splash";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Jam", template: "%s | Jam" },
  description: "サークル・部活のためのオールインワン連絡アプリ。トーク、投票、カレンダー、出欠、お知らせ、写真をひとつに。",
  applicationName: "Jam",
  appleWebApp: { capable: true, title: "Jam", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the splash script may add `no-splash` to <html> before React hydrates.
    <html lang="ja" suppressHydrationWarning>
      <body>
        <Splash />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
