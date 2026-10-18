/**
 * GET /api/seances/purge — appelé chaque jour par la tâche planifiée de Vercel
 * (vercel.json) : supprime les séances enregistrées depuis plus de 12 mois,
 * comme l'annonce la politique de confidentialité. Vercel envoie
 * « Authorization: Bearer <CRON_SECRET> » ; sans lui, 404.
 */
import { purgeOld } from "@/server/sessionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not found", { status: 404 });
  const deleted = await purgeOld(new Date());
  return Response.json({ deleted }, { headers: { "Cache-Control": "no-store" } });
}
