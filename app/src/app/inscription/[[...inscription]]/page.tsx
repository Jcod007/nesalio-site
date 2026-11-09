import { SignUp } from "@clerk/nextjs";
import { headers } from "next/headers";
import { accountAuthConfigured } from "@/server/authConfig";
import { AccountPage, AccountUnavailable } from "@/ui/AccountPage";
import { localInspectionAvailable } from "@/server/tutor/inspection";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ inspect?: string | string[] }> }) {
  if (!accountAuthConfigured()) return <AccountUnavailable />;
  const inspection = (await searchParams).inspect === "1" && localInspectionAvailable((await headers()).get("host"));
  return (
    <AccountPage>
      <SignUp routing="path" path="/inscription" signInUrl={inspection ? "/connexion?inspect=1" : "/connexion"} forceRedirectUrl={inspection ? "/?inspect=1" : "/"} />
    </AccountPage>
  );
}
