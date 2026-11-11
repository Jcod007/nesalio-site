import { headers } from "next/headers";
import { NesalioApp } from "@/ui/NesalioApp";
import { NesaUnavailable } from "@/ui/AccountPage";
import { nesalioAvailable } from "@/server/explainer";

export const dynamic = "force-dynamic";

// Same as the student page: the development access must show what students get.
export default async function DevPage() {
  return nesalioAvailable({ headers: await headers() }) ? <NesalioApp /> : <NesaUnavailable />;
}
