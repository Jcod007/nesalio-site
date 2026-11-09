import { TutorApp } from "@/ui/TutorApp";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { accountAuthConfigured, localAccountDemo } from "@/server/authConfig";
import { AccountUnavailable } from "@/ui/AccountPage";
import { localInspectionAvailable } from "@/server/tutor/inspection";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ inspect?: string | string[] }> }) {
  const inspectionAvailable = localInspectionAvailable((await headers()).get("host"));
  const inspection = inspectionAvailable && (await searchParams).inspect === "1";
  if (localAccountDemo()) return <TutorApp inspection={inspection} inspectionAvailable={inspectionAvailable} />;
  if (!accountAuthConfigured()) return <AccountUnavailable />;
  let userId: string | null;
  try { userId = (await auth({ acceptsToken: "session_token" })).userId; }
  catch { return <AccountUnavailable />; }
  if (!userId) redirect(inspection ? "/connexion?inspect=1" : "/connexion");
  return <TutorApp inspection={inspection} inspectionAvailable={inspectionAvailable} />;
}
