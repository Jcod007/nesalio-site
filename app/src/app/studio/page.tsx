import type { Metadata } from "next";
import { StudioApp } from "@/ui/studio/StudioApp";

export const metadata: Metadata = {
  title: "Nesalio Studio",
  robots: { index: false, follow: false },
};

export default function StudioPage() {
  return <StudioApp />;
}
