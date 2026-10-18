/**
 * GET /api/seances?check=<SELFTEST_TOKEN>[&jour=AAAA-MM-JJ][&env=production|preview][&session=xxxxxxxx]
 *
 * Consulter les séances enregistrées d'un jour (par défaut aujourd'hui, en
 * temps universel), tour par tour, dans l'ordre. `session` : les 8 premiers
 * caractères de la session (ceux des retours de testeurs). Sans le bon jeton : 404.
 */
import type { RecordEnv } from "@/domain/sessionLog";
import { listTurns, recordEnv, sessionBlob } from "@/server/sessionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SHORT_SESSION = /^[a-z0-9]{8}$|^sans-session$/i;

export async function GET(request: Request): Promise<Response> {
  const token = process.env.SELFTEST_TOKEN?.trim();
  const params = new URL(request.url).searchParams;
  if (!token || params.get("check") !== token) return new Response("Not found", { status: 404 });

  const blob = sessionBlob();
  if (!blob) return Response.json({ error: "Enregistrement des séances désactivé (pas de BLOB_READ_WRITE_TOKEN)." }, { status: 503 });

  const day = params.get("jour") ?? new Date().toISOString().slice(0, 10);
  const envParam = params.get("env");
  const env: RecordEnv = envParam === "preview" || envParam === "production" || envParam === "development" ? envParam : recordEnv();
  const session = params.get("session") ?? undefined;
  if (!DAY.test(day) || (session !== undefined && !SHORT_SESSION.test(session))) {
    return Response.json({ error: "Paramètres invalides : jour=AAAA-MM-JJ, session = 8 caractères." }, { status: 400 });
  }

  const turns = await listTurns({ env, day, session }, blob);
  const sessions = new Set(turns.map((t) => t.session ?? "sans-session"));
  return Response.json(
    { env, jour: day, seances: sessions.size, tours: turns.length, turns },
    { headers: { "Cache-Control": "no-store" } },
  );
}
