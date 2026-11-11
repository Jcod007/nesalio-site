import { headers } from "next/headers";
import { nesalioAvailable } from "@/server/explainer";
import { accountAuthConfigured, localAccountDemo } from "@/server/authConfig";
import { AccountUnavailable, NesaUnavailable } from "@/ui/AccountPage";
import { NesalioApp } from "@/ui/NesalioApp";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Local demo (NESALIO_LOCAL_DEMO=1 with DISABLE_AI=1, never on Vercel): the page renders without a model,
  // for the browser path test (tools/e2e/nesalio.mjs answers /api/nesalio and /api/voice itself).
  if (localAccountDemo()) return <NesalioApp />;
  if (!nesalioAvailable({ headers: await headers() })) return <NesaUnavailable />;
  if (!accountAuthConfigured()) return <AccountUnavailable />;
  // The same client tree stays mounted before and after in-place sign-in.
  // Paid operations independently enforce the account or bounded trial (usageAccess.ts).
  return <NesalioApp />;
}
