import Link from "next/link";
import AccountCard from "@/components/AccountCard";
import MeGym from "./MeGym";

export default function MePage() {
  return (
    <>
      <MeGym />
      <div className="mt-7">
        <AccountCard />
      </div>
      <p className="mt-4 text-center text-meta text-muted">
        <Link href="/privacy" className="underline">隱私權政策</Link>
        {" · "}
        <Link href="/rules" className="underline">留言與影片規範</Link>
      </p>
    </>
  );
}
