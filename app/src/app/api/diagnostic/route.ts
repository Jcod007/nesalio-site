/**
 * POST /api/diagnostic (Authorization: Bearer <SELFTEST_TOKEN>) — vérifie un document Nesalio assemblé, ou une
 * sortie du modèle, sans appeler aucun fournisseur. Sans le bon jeton : 404.
 * (La séance complète de l'ancien tuteur, en GET, a été retirée avec lui le 2026-11-10.)
 */
import { hasSelfTestAccess } from "@/server/adminAccess";
import { readJson } from "@/server/http";
import { validateLesson, validateModelOutput } from "@/domain/nesalio/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!hasSelfTestAccess(request)) return new Response("Not found", { status: 404, headers });
  const input = await readJson(request, 128_000);
  if (!input.ok) return input.response;
  const body = input.body;
  const assembled = typeof body === "object" && body !== null && "version" in body;
  const result = assembled ? validateLesson(body) : validateModelOutput(body);
  if (!result.ok) return Response.json({ ok: false, issues: result.issues }, { status: 422, headers });
  return Response.json({ ok: true, slices: result.value.slices.length }, { headers });
}
