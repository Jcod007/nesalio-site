/**
 * /api/studio — le studio de vidéos TikTok (outil interne de Nesalio).
 *
 * GET                     → { locked, ai } : faut-il un code d'accès, un modèle est-il branché ?
 * GET ?consignes=<format> → les consignes complètes, à donner telles quelles à une autre IA.
 * POST { action: "generate", prompt, format }                       → { source, script, issues }
 * POST { action: "revise", script, shot, instruction, board, format } → { shots, issues }
 *
 * Les appels au modèle coûtent : ils exigent le code du studio (en-tête
 * x-studio-code), égal à STUDIO_TOKEN, ou à SELFTEST_TOKEN s'il n'est pas défini.
 * Sans aucun des deux, le studio n'est ouvert qu'en développement local.
 */
import { z } from "zod";
import { StudioScriptSchema, VideoFormat, type StudioScript } from "@/domain/studio/script";
import { readAiConfig } from "@/server/config";
import { jsonError, readJson } from "@/server/http";
import { createSessionLimits } from "@/server/rateLimit";
import { studioSystemPrompt } from "@/server/studio/prompt";
import { generateVideo, reviseShot } from "@/server/studio/service";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const limiter = createSessionLimits({ limit: 30, windowMs: 10 * 60_000 });

const GenerateBody = z.object({
  action: z.literal("generate"),
  prompt: z.string().trim().min(3).max(4000),
  format: VideoFormat.default("libre"),
});
const ReviseBody = z.object({
  action: z.literal("revise"),
  script: StudioScriptSchema,
  shot: z.number().int().min(0),
  instruction: z.string().trim().min(3).max(1000),
  board: z.array(z.string().max(300)).max(40).default([]),
  format: VideoFormat.default("libre"),
});
const Body = z.discriminatedUnion("action", [GenerateBody, ReviseBody]);

function studioToken(): string | null {
  return process.env.STUDIO_TOKEN?.trim() || process.env.SELFTEST_TOKEN?.trim() || null;
}

/** `null` si l'accès est permis, sinon la réponse d'erreur. */
function guard(request: Request): Response | null {
  const token = studioToken();
  if (!token) {
    return process.env.NODE_ENV === "production" ? jsonError(403, "Studio fermé : définis STUDIO_TOKEN dans Vercel pour l'ouvrir.") : null;
  }
  return request.headers.get("x-studio-code") === token ? null : jsonError(401, "Code du studio incorrect.");
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const format = VideoFormat.safeParse(params.get("consignes"));
  if (params.has("consignes")) {
    return new Response(studioSystemPrompt(format.success ? format.data : "libre"), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const config = readAiConfig(request.headers);
  const locked = studioToken() !== null || process.env.NODE_ENV === "production";
  return Response.json({ locked, ai: config.chat !== null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const limit = limiter.check(request.headers);
  if (!limit.allowed) return jsonError(429, "Beaucoup de demandes d'un coup. Réessaie dans quelques minutes.", { "Retry-After": String(limit.retryAfterSeconds) });

  const read = await readJson(request, 120_000);
  if (!read.ok) return read.response;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return jsonError(400, "Requête invalide.");

  const config = {
    provider: readAiConfig(request.headers).chat,
    completion: streamChatCompletion,
    signal: request.signal,
    log: (message: string, detail?: unknown) => console.warn("[studio]", message, detail),
  };
  const body = parsed.data;

  if (body.action === "generate") {
    const result = await generateVideo(body.prompt, body.format, config);
    if (!result.ok) return jsonError(result.status, result.message);
    return Response.json({ source: result.source, script: result.script, issues: result.issues }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.shot >= body.script.shots.length) return jsonError(400, "Ce plan n'existe pas.");
  const result = await reviseShot(
    { script: body.script as StudioScript, shot: body.shot, instruction: body.instruction, board: body.board },
    body.format,
    config,
  );
  if (!result.ok) return jsonError(result.status, result.message);
  return Response.json({ shots: result.shots, issues: result.issues }, { headers: { "Cache-Control": "no-store" } });
}
