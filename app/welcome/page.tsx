import type { Metadata } from "next";
import { Suspense } from "react";
import NicknameForm from "./NicknameForm";

export const metadata: Metadata = { title: "填寫暱稱 | 原岩路線" };

export default function WelcomePage() {
  return (
    <Suspense>
      <NicknameForm />
    </Suspense>
  );
}
