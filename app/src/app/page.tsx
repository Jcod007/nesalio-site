import { NesalioApp } from "@/ui/NesalioApp";
import { nesalioAvailable } from "@/server/explainer";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { accountAuthConfigured, localAccountDemo } from "@/server/authConfig";
import { AccountUnavailable, NesaUnavailable } from "@/ui/AccountPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  const requestHeaders = await headers();
  const app = nesalioAvailable({ headers: requestHeaders }) ? <NesalioApp /> : <NesaUnavailable />;
  if (localAccountDemo()) return app;
  if (!accountAuthConfigured()) return <AccountUnavailable />;
  let userId: string | null;
  try { userId = (await auth({ acceptsToken: "session_token" })).userId; }
  catch { return <AccountUnavailable />; }
  if (!userId) redirect("/connexion");
  return app;
}
