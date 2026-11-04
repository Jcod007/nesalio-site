import { SignUp } from "@clerk/nextjs";
import { accountAuthConfigured } from "@/server/authConfig";
import { AccountPage, AccountUnavailable } from "@/ui/AccountPage";

export default function SignUpPage() {
  if (!accountAuthConfigured()) return <AccountUnavailable />;
  return (
    <AccountPage title="Crée ton compte Nesalio">
      <SignUp routing="path" path="/inscription" signInUrl="/connexion" forceRedirectUrl="/" />
    </AccountPage>
  );
}
