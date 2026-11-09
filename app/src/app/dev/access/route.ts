import { NextResponse, type NextRequest } from "next/server";
import { DEV_COOKIE, devCookieValue, validDevKey } from "@/server/devAccess";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): Response {
  if (!validDevKey(request.nextUrl.searchParams.get("key"))) {
    return new Response("Lien de développement invalide.", { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const response = NextResponse.redirect(new URL("/dev", request.url));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(DEV_COOKIE, devCookieValue()!, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 30 * 24 * 60 * 60 });
  return response;
}
