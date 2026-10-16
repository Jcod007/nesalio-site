import { describe, expect, it } from "vitest";
import { serializeLesson } from "./prompt";
import { derivativeLesson } from "@/content/demoLessons";
import type { StreamEvent } from "@/domain/scene/schema";
import { parseSse, UpstreamError, type CompletionStream } from "./openrouter";
import { tutorEvents } from "./service";

async function collect(iterable: AsyncIterable<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const event of iterable) out.push(event);
  return out;
}

/** Simule un modèle qui écrit le texte donné par petits morceaux. */
const fakeCompletion =
  (text: string, failAfter?: number): CompletionStream =>
  async function* () {
    let sent = 0;
    for (const chunk of text.match(/[\s\S]{1,13}/g) ?? []) {
      if (failAfter !== undefined && sent >= failAfter) throw new UpstreamError("coupure");
      sent += chunk.length;
      yield chunk;
    }
  };

const base = { model: "test", apiKey: "k" };

describe("tutorEvents", () => {
  it("relaie une séance complète du modèle, validée étape par étape", async () => {
    const text = "```json\n" + serializeLesson(derivativeLesson) + "\n```";
    const events = await collect(
      tutorEvents({ mode: "question", question: "dérivée ?" }, { ...base, completion: fakeCompletion(text) }),
    );
    expect(events[0]).toEqual({ kind: "source", source: "model" });
    expect(events[1]).toMatchObject({ kind: "lesson", title: derivativeLesson.header.title });
    expect(events.filter((e) => e.kind === "step")).toHaveLength(derivativeLesson.steps.length);
    expect(events.at(-1)).toMatchObject({ kind: "end" });
  });

  it("ajoute un titre et une fin quand le modèle les oublie", async () => {
    const text = '{"kind":"step","say":"Première idée."}\n{"kind":"step","say":"Deuxième idée."}';
    const events = await collect(
      tutorEvents({ mode: "question", question: "Pourquoi le ciel est bleu ?" }, { ...base, completion: fakeCompletion(text) }),
    );
    expect(events.map((e) => e.kind)).toEqual(["source", "lesson", "step", "step", "end"]);
  });

  it("ne renvoie pas d'en-tête pour une réponse à une interruption", async () => {
    const text = '{"kind":"lesson","title":"x"}\n{"kind":"step","say":"Je reformule."}\n{"kind":"end","summary":[]}';
    const events = await collect(
      tutorEvents(
        { mode: "followUp", question: "hein ?", context: { spoken: [], board: [] } },
        { ...base, completion: fakeCompletion(text) },
      ),
    );
    expect(events.map((e) => e.kind)).toEqual(["source", "step", "end"]);
  });

  it("signale une erreur si le modèle échoue avant la première étape", async () => {
    const events = await collect(
      tutorEvents({ mode: "question", question: "?" }, { ...base, completion: fakeCompletion("{}", 0) }),
    );
    expect(events.at(-1)).toMatchObject({ kind: "error", code: "upstream" });
  });

  it("termine proprement si le modèle coupe en cours de séance", async () => {
    const text = '{"kind":"step","say":"Une."}\n{"kind":"step","say":"Deux."}\n{"kind":"step","say":"Trois."}';
    const events = await collect(
      tutorEvents({ mode: "question", question: "?" }, { ...base, completion: fakeCompletion(text, 30) }),
    );
    expect(events.filter((e) => e.kind === "step").length).toBeGreaterThan(0);
    expect(events.at(-1)).toEqual({ kind: "end", summary: [] });
  });

  it("signale une réponse vide", async () => {
    const events = await collect(
      tutorEvents({ mode: "question", question: "?" }, { ...base, completion: fakeCompletion("Désolé, je ne peux pas.") }),
    );
    expect(events.at(-1)).toMatchObject({ kind: "error", code: "empty" });
  });

  it("joue une séance de démonstration sans clé", async () => {
    const events = await collect(
      tutorEvents({ mode: "question", question: "C'est quoi une dérivée ?" }, { model: "m", completion: fakeCompletion("") }),
    );
    expect(events[0]).toEqual({ kind: "source", source: "demo" });
    expect(events[1]).toMatchObject({ title: derivativeLesson.header.title });

    const other = await collect(
      tutorEvents({ mode: "question", question: "La mitose ?" }, { model: "m", completion: fakeCompletion("") }),
    );
    expect(other[2]).toMatchObject({ kind: "step", mood: "idee" });
  });
});

describe("parseSse", () => {
  const stream = (text: string) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(text);
        for (let i = 0; i < bytes.length; i += 9) controller.enqueue(bytes.slice(i, i + 9));
        controller.close();
      },
    });

  it("extrait le texte des événements et ignore les commentaires", async () => {
    const body = [
      ": OPENROUTER PROCESSING",
      'data: {"choices":[{"delta":{"content":"Bon"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"jour"}}]}',
      "data: [DONE]",
      "",
    ].join("\n");
    const out: string[] = [];
    for await (const text of parseSse(stream(body))) out.push(text);
    expect(out.join("")).toBe("Bonjour");
  });

  it("transforme une erreur en cours de flux en exception", async () => {
    const body = 'data: {"error":{"message":"quota"}}\n\n';
    await expect(async () => {
      for await (const _ of parseSse(stream(body))) void _;
    }).rejects.toThrow("quota");
  });
});
