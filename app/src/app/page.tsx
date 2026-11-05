import { TutorApp } from "@/ui/TutorApp";
import { accountAuthConfigured, localAccountDemo } from "@/server/authConfig";
import { AccountUnavailable } from "@/ui/AccountPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (localAccountDemo()) return <TutorApp />;
  if (!accountAuthConfigured()) return <AccountUnavailable />;
  // The same client tree stays mounted before and after in-place sign-in.
  // Paid operations independently enforce the account or bounded trial.
  return <TutorApp />;
}
