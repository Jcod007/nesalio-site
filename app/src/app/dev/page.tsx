import { cookies } from "next/headers";
import { TutorApp } from "@/ui/TutorApp";
import { DEV_COOKIE, validDevCookie } from "@/server/devAccess";

export const dynamic = "force-dynamic";

export default async function DevPage() {
  const value = (await cookies()).get(DEV_COOKIE)?.value;
  if (!value || !validDevCookie(`${DEV_COOKIE}=${value}`)) {
    return <main><p>Ouvre ton lien privé de développement pour accéder au tuteur.</p></main>;
  }
  return <TutorApp />;
}

