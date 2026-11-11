import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import { frFR } from "@clerk/localizations";
import { accountAuthConfigured } from "@/server/authConfig";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/caveat/600.css";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";

const accountLocalization = {
  ...frFR,
  signUp: {
    ...frFR.signUp,
    start: {
      ...frFR.signUp?.start,
      title: "Crée ton compte",
      titleCombined: "Crée ton compte",
      actionText: "Tu as déjà un compte ?",
      actionLink: "Connecte-toi",
    },
  },
};

export const metadata: Metadata = {
  title: "Nesalio · Essaie Nesalio",
  description: "Pose ta question de mathématiques : Nesa te répond à voix haute en dessinant l'explication au tableau. Secondaire 4 et 5.",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F6F8FC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body>
        {accountAuthConfigured() ? (
          <ClerkProvider
            localization={accountLocalization}
            signInUrl="/connexion"
            signUpUrl="/inscription"
            signInForceRedirectUrl="/"
            signUpForceRedirectUrl="/"
            afterSignOutUrl="/connexion"
            appearance={{ variables: { colorPrimary: "#5A45D6", fontFamily: "Atkinson Hyperlegible, sans-serif", borderRadius: "14px" } }}
          >
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
        {/* Nesa, la mascotte du site, partagée telle quelle (élément <nesa-mascot>). */}
        <Script src="/nesa.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
