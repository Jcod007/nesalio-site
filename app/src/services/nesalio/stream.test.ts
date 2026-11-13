import { afterEach, describe, expect, it, vi } from "vitest";
import { openNesalioStream } from "./stream";

const ndjson = (body: string) => new Response(body, { headers: { "content-type": "application/x-ndjson" } });

describe("flux de /api/nesalio", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("une ligne coupée donne un message pour l'élève, pas celui de l'analyseur JSON", async () => {
    vi.stubGlobal("fetch", async () => ndjson('{"kind":"les'));
    const failure = await openNesalioStream("q", new AbortController().signal).then(
      () => null,
      (error: Error) => error.message,
    );
    expect(failure).toMatch(/^L'explication s'est arrêtée en route/);
    expect(failure).not.toMatch(/JSON/);
  });

  it("transmet le message d'erreur envoyé par le serveur", async () => {
    vi.stubGlobal("fetch", async () => ndjson('{"kind":"error","code":"daily_limit","message":"Reviens demain !"}\n'));
    await expect(openNesalioStream("q", new AbortController().signal)).rejects.toThrow("Reviens demain !");
  });
});

describe("fin du flux", () => {
  afterEach(() => vi.unstubAllGlobals());
  const header = JSON.stringify({ kind: "lesson", lesson: { id: "l", title: "Titre", language: "fr", learning_goal: "But" } });
  const drain = async (body: string) => {
    vi.stubGlobal("fetch", async () => ndjson(body));
    const stream = await openNesalioStream("q", new AbortController().signal);
    for await (const _ of stream.slices) {
      /* read to the end */
    }
  };

  it("un flux fermé sans « end » est une leçon coupée, pas une leçon complète", async () => {
    await expect(drain(`${header}\n`)).rejects.toThrow(/arrêtée en route/);
  });

  it("un flux terminé par « end » se lit sans erreur", async () => {
    await expect(drain(`${header}\n{"kind":"end"}\n`)).resolves.toBeUndefined();
  });
});
