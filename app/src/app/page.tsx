import { TutorApp } from "@/ui/TutorApp";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { accountAuthConfigured, localAccountDemo } from "@/server/authConfig";
import { AccountUnavailable } from "@/ui/AccountPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (localAccountDemo()) return <TutorApp />;
  if (!accountAuthConfigured()) return <AccountUnavailable />;
  let userId: string | null;
  try { userId = (await auth({ acceptsToken: "session_token" })).userId; }
  catch { return <AccountUnavailable />; }
  if (!userId) redirect("/connexion");
  return <TutorApp />;
}
