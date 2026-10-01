// 圖示（來源：原型的 ICON）
const PATHS = {
  flash: "M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.8z",
  send: "M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.6 7.9l-1.4-1.4z",
  project: "M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6z",
  chat: "M4 4h16v12H8l-4 4z",
  lock: "M7 10V8a5 5 0 0 1 10 0v2h1v11H6V10zm2 0h6V8a3 3 0 0 0-6 0z",
  down: "m7 9 5 5 5-5z",
  video: "M3 6h12v12H3zm13 4.5 5-3v9l-5-3z",
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = "size-[1em]" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`inline-block flex-none fill-current align-[-0.12em] ${className}`}>
      <path d={PATHS[name]} />
    </svg>
  );
}
