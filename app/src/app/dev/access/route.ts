/**
 * Accès privé au développement : GET affiche un champ, POST reçoit le secret dans le corps.
 * Le secret ne passe jamais dans l'adresse : une adresse reste dans les journaux du serveur
 * et dans l'historique du navigateur.
 */
import { NextResponse } from "next/server";
import { DEV_COOKIE, DEV_COOKIE_DAYS, devCookieValue, validDevKey } from "@/server/devAccess";
import { readBoundedText } from "@/server/http";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

const FORM = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Accès de développement</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 24rem; margin: 20vh auto; padding: 0 1rem; }
label, input, button { display: block; width: 100%; box-sizing: border-box; font-size: 1rem; }
input, button { margin-top: 0.5rem; padding: 0.6rem; }
</style>
</head>
<body>
<form method="post" action="/dev/access">
<label for="key">Secret d'accès au développement</label>
<input id="key" name="key" type="password" autocomplete="off" required autofocus>
<button type="submit">Ouvrir</button>
</form>
</body>
</html>`;

export function GET(): Response {
  return new Response(FORM, { headers: { ...PRIVATE, "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(request: Request): Promise<Response> {
  const refused = () => new Response("Accès de développement refusé.", { status: 404, headers: PRIVATE });
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return refused();
  const raw = await readBoundedText(request, 2_000);
  if (!raw.ok || !validDevKey(new URLSearchParams(raw.text).get("key"))) return refused();
  // 303 : le navigateur ouvre /dev en GET, sans renvoyer le secret.
  const response = NextResponse.redirect(new URL("/dev", request.url), 303);
  for (const [name, value] of Object.entries(PRIVATE)) response.headers.set(name, value);
  response.cookies.set(DEV_COOKIE, devCookieValue()!, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: DEV_COOKIE_DAYS * 24 * 60 * 60,
  });
  return response;
}
