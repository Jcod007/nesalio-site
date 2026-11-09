import { auth } from "@clerk/nextjs/server";
import { encodeLine } from "@/domain/tutor/ndjson";
import { accountAuthConfigured, accountOrigins, localAccountDemo } from "./authConfig";
import { validDevCookie } from "./devAccess";

type Access = { ok: true; userId: string } | { ok: false; response: Response };

function denied(status: number, message: string, ndjson: boolean): Access {
  const headers = { "Cache-Control": "no-store", "Vary": "Cookie, Origin" };
  return {
    ok: false,
    response: ndjson
      ? new Response(encodeLine({ kind: "error", code: "upstream", message }), {
          status, headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8" },
        })
      : Response.json({ error: message }, { status, headers }),
  };
}

/** Authenticate at the operation itself, before reading bodies or calling paid services. */
export async function requireAccount(request: Request, ndjson = false): Promise<Access> {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && !accountOrigins().includes(origin))) {
    return denied(403, "Cette requête ne vient pas de Nesalio.", ndjson);
  }
  if (localAccountDemo()) return { ok: true, userId: "local-demo" };
  if (validDevCookie(request.headers.get("cookie"))) return { ok: true, userId: "development-guest" };
  if (!accountAuthConfigured()) return denied(503, "La connexion est temporairement indisponible. Réessaie plus tard.", ndjson);
  try {
    // Session cookies only: API keys and machine tokens do not identify a student.
    const session = await auth({ acceptsToken: "session_token" });
    if (!session.userId) return denied(401, "Connecte-toi pour continuer. Si ta session a expiré, recharge la page.", ndjson);
    return { ok: true, userId: session.userId };
  } catch {
    return denied(503, "La connexion est temporairement indisponible. Réessaie plus tard.", ndjson);
  }
}
