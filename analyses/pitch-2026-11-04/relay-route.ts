import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { readBoundedText } from "@/server/http";

export const runtime = "nodejs";
export const maxDuration = 180;

/** Relais temporaire pour capturer une vraie séance dans l'habillage du pitch. */
export async function POST(request: Request, { params }: { params: Promise<{ service: string }> }) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const { service } = await params;
  if (service !== "tutor" && service !== "voice") return new Response(null, { status: 404 });
  const body = await readBoundedText(request, 96_000);
  if (!body.ok) return new Response(null, { status: body.status });
  const upstream = await fetch(`https://nesalio-qw3bfc3kj-jcod.vercel.app/api/${service}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-nesalio-session": "capture-joyce-20261104" },
    body: body.text,
    signal: request.signal,
  });
  if (service === "tutor" && upstream.ok) {
    const recorded = await upstream.text();
    await appendFile(join(process.cwd(), "../analyses/pitch-2026-11-04/session.ndjson"),
      JSON.stringify({ request: JSON.parse(body.text), events: recorded }) + "\n", "utf8");
    return new Response(recorded, { status: upstream.status, headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
  }
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const name of ["Content-Type", "X-Speech-Span"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
