import { SignIn } from "@clerk/nextjs";
import { headers } from "next/headers";
import { accountAuthConfigured } from "@/server/authConfig";
import { AccountPage, AccountUnavailable } from "@/ui/AccountPage";
import { localInspectionAvailable } from "@/server/tutor/inspection";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ inspect?: string | string[] }> }) {
  if (!accountAuthConfigured()) return <AccountUnavailable />;
  const inspection = (await searchParams).inspect === "1" && localInspectionAvailable((await headers()).get("host"));
  return (
    <AccountPage title="Retrouve ton espace de maths">
      <SignIn routing="path" path="/connexion" signUpUrl={inspection ? "/inscription?inspect=1" : "/inscription"} forceRedirectUrl={inspection ? "/?inspect=1" : "/"} />
    </AccountPage>
  );
}
