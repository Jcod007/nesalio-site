import { SignIn } from "@clerk/nextjs";
import { accountAuthConfigured } from "@/server/authConfig";
import { AccountPage, AccountUnavailable } from "@/ui/AccountPage";

export default function SignInPage() {
  if (!accountAuthConfigured()) return <AccountUnavailable />;
  return (
    <AccountPage title="Retrouve ton espace de maths">
      <SignIn routing="path" path="/connexion" signUpUrl="/inscription" forceRedirectUrl="/" />
    </AccountPage>
  );
}
