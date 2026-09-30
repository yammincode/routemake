import type { Metadata } from "next";
import GymPicker from "./GymPicker";

export const metadata: Metadata = { title: "選擇攀岩館 | 原岩路線" };

export default function GymsPage() {
  return <GymPicker />;
}
