import { describe, expect, it } from "vitest";
import { readBoundedText, readJson } from "./http";

function streamed(chunks: Uint8Array[], onCancel = () => {}) {
  return new Request("http://localhost", { method: "POST", duplex: "half", body: new ReadableStream({
    pull(controller) { const chunk = chunks.shift(); if (chunk) controller.enqueue(chunk); else controller.close(); },
    cancel: onCancel,
  }) } as RequestInit);
}

describe("lecture bornée des requêtes", () => {
  const encoder = new TextEncoder();
  it("compte les octets UTF-8 et non les caractères, même sans Content-Length", async () => {
    const result = await readBoundedText(new Request("http://localhost", { method: "POST", body: "éé" }), 3);
    expect(result).toEqual({ ok: false, status: 413 });
  });
  it("interrompt un flux trop grand sans lire le reste", async () => {
    let cancelled = false;
    const chunks = [encoder.encode("123"), encoder.encode("456"), encoder.encode("789"), encoder.encode("suite")];
    expect(await readBoundedText(streamed(chunks, () => { cancelled = true; }), 4)).toEqual({ ok: false, status: 413 });
    expect(cancelled).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });
  it("accepte un caractère UTF-8 réparti entre deux morceaux à la limite exacte", async () => {
    const data = encoder.encode('"é"');
    expect(await readJson(streamed([data.slice(0, 2), data.slice(2)]), data.length)).toEqual({ ok: true, body: "é" });
  });
  it("répond proprement aux données invalides et aux flux coupés", async () => {
    expect(await readBoundedText(streamed([new Uint8Array([0xff])]), 10)).toEqual({ ok: false, status: 400 });
    const invalid = await readJson(new Request("http://localhost", { method: "POST", body: "{" }), 10);
    expect(!invalid.ok && invalid.response.status).toBe(400);
    const broken = new Request("http://localhost", { method: "POST", duplex: "half", body: new ReadableStream({
      start(controller) { controller.error(new Error("coupure")); },
    }) } as RequestInit);
    expect(await readBoundedText(broken, 10)).toEqual({ ok: false, status: 400 });
  });
});
