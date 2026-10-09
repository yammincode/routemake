import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Noto_Sans_TC } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import TabBar from "@/components/TabBar";
import { ToastProvider } from "@/components/ui/Toast";
import InstallHelp from "@/components/InstallHelp";
import SyncManager from "@/components/SyncManager";
import UpdateWatcher from "@/components/UpdateWatcher";
import "./globals.css";

// 注意：不要改成 weight: "variable"。CSS 變小後中文字型會提早開始下載，跟程式檔搶網路，
// 第一次打開時畫面先出來、按鈕卻要多等約 1 秒才按得動（實測 4G：畫面 1.1 秒、能按 3.7 秒；現在兩者都在約 2.8 秒）
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
            <main className="mx-auto max-w-page px-4 pt-3 pb-28">
              <SyncManager />
              {children}
            </main>
            <TabBar />
          </AuthProvider>
          <UpdateWatcher />
          <InstallHelp />
        </ToastProvider>
      </body>
    </html>
  );
}
