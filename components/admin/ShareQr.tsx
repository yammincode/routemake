"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SectionTitle, Tip } from "@/components/ui/Card";
import { SetBox } from "@/components/ui/Stats";

// 櫃檯用 QR code：網址加 openExternalBrowser=1，從 LINE 掃也會改用瀏覽器打開
export default function ShareQr() {
  const [url, setUrl] = useState("");
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    const u = `${location.origin}/?openExternalBrowser=1`;
    QRCode.toDataURL(u, { width: 600, margin: 2, color: { dark: "#15201B", light: "#FFFFFF" } }).then((d) => {
      setUrl(u);
      setImg(d);
    });
  }, []);

  return (
    <>
      <SectionTitle>櫃檯 QR code</SectionTitle>
      <SetBox>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="原岩路線 QR code" className="mx-auto mt-3 block w-48 rounded-cell" />
        )}
        <p className="mt-2 mb-3 text-center text-meta break-all text-muted">{url}</p>
        <Button
          disabled={!img}
          onClick={() => {
            const a = document.createElement("a");
            a.href = img!;
            a.download = "原岩路線-QR.png";
            a.click();
          }}
        >
          下載 QR code 圖片
        </Button>
        <Tip>印出來放在櫃檯，旁邊附上「加到主畫面」的步驟。分享連結時也請用這個網址。</Tip>
      </SetBox>
    </>
  );
}
