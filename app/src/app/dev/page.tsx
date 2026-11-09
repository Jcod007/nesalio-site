import { headers } from "next/headers";
import { TutorApp } from "@/ui/TutorApp";
import { NesalioApp } from "@/ui/NesalioApp";
import { explainerFor } from "@/server/explainer";

export const dynamic = "force-dynamic";

// Same choice as the student page: the development access must show what students get.
export default async function DevPage() {
  return explainerFor({ headers: await headers(), inspection: false }) === "nesalio" ? <NesalioApp /> : <TutorApp />;
}
