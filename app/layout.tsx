import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Noto_Sans_TC } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import TabBar from "@/components/TabBar";
import { ToastProvider } from "@/components/ui/Toast";
import UpdateWatcher from "@/components/UpdateWatcher";
import "./globals.css";

const noto = Noto_Sans_TC({
  variable: "--font-noto",
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  weight: ["600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "原岩攀岩館 路線",
  description: "查看原岩攀岩館的路線、記錄你的完攀",
  applicationName: "原岩路線",
  appleWebApp: {
    capable: true,
    title: "原岩路線",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e6e8e4" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1412" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${noto.variable} ${barlow.variable}`}>
      <body className="font-sans">
        <ToastProvider>
          <AuthProvider>
            <main className="mx-auto max-w-page px-4 pt-3 pb-28">{children}</main>
            <TabBar />
          </AuthProvider>
          <UpdateWatcher />
        </ToastProvider>
      </body>
    </html>
  );
}
