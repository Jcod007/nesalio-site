import { TutorApp } from "@/ui/TutorApp";
import { NesalioApp } from "@/ui/NesalioApp";
import { explainerFor } from "@/server/explainer";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { accountAuthConfigured, localAccountDemo } from "@/server/authConfig";
import { AccountUnavailable } from "@/ui/AccountPage";
import { localInspectionAvailable } from "@/server/tutor/inspection";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ inspect?: string | string[] }> }) {
  const requestHeaders = await headers();
  const inspectionAvailable = localInspectionAvailable(requestHeaders.get("host"));
  const inspection = inspectionAvailable && (await searchParams).inspect === "1";
  // Nesalio explains by default; NESALIO_EXPLICATION=0, no model or JSON inspection keep the old tutor.
  const app = explainerFor({ headers: requestHeaders, inspection }) === "nesalio"
    ? <NesalioApp />
    : <TutorApp inspection={inspection} inspectionAvailable={inspectionAvailable} />;
  if (localAccountDemo()) return app;
  if (!accountAuthConfigured()) return <AccountUnavailable />;
  let userId: string | null;
  try { userId = (await auth({ acceptsToken: "session_token" })).userId; }
  catch { return <AccountUnavailable />; }
  if (!userId) redirect(inspection ? "/connexion?inspect=1" : "/connexion");
  return app;
}
