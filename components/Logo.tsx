// 暫用 Logo：拿到原岩正式 Logo 後，替換 public/logo.png（必要時調整這裡的尺寸）
export default function Logo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.png" alt="原岩攀岩館" width={32} height={32} className="size-8 rounded-lg" />;
}
