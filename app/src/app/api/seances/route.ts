/**
 * GET /api/seances?check=<SELFTEST_TOKEN>[&jour=AAAA-MM-JJ][&env=production|preview][&session=xxxxxxxx][&ref=…][&resume=1]
 *
 * Consulter les séances enregistrées d'un jour (par défaut aujourd'hui, en
 * temps universel), tour par tour, dans l'ordre. `session` : les 8 premiers
 * caractères de la session (ceux des retours de testeurs). `ref` : seulement
 * les séances d'une inscription (la référence notée dans Formspree).
 * `resume=1` : une ligne par séance (référence, questions, réponses), sans le
 * détail des tours. Sans le bon jeton : 404.
 */
import { summarizeSessions, type RecordEnv } from "@/domain/sessionLog";
import { isRef, shortSession as shortSessionOf } from "@/domain/session";
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
  const ref = params.get("ref") ?? undefined;
  if (!DAY.test(day) || (session !== undefined && !SHORT_SESSION.test(session)) || (ref !== undefined && !isRef(ref))) {
    return Response.json({ error: "Paramètres invalides : jour=AAAA-MM-JJ, session = 8 caractères, ref = référence de l'inscription." }, { status: 400 });
  }

  const all = await listTurns({ env, day, session }, blob);
  const summaries = summarizeSessions(all);
  // Une séance appartient à une inscription si un de ses tours porte la référence.
  const kept = ref ? new Set(summaries.filter((s) => s.ref === ref).map((s) => s.session)) : null;
  const turns = kept ? all.filter((t) => kept.has(t.session ? shortSessionOf(t.session) : "sans-session")) : all;
  const seances = kept ? summaries.filter((s) => kept.has(s.session)) : summaries;
  const inscrites = seances.filter((s) => s.ref).length;
  const head = { env, jour: day, seances: seances.length, inscrites, tours: turns.length };
  return Response.json(params.get("resume") === "1" ? { ...head, parSeance: seances } : { ...head, parSeance: seances, turns }, {
    headers: { "Cache-Control": "no-store" },
  });
}
