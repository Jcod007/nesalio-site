import { describe, expect, it } from "vitest";
import { serializeLesson } from "./prompt";
import { derivativeLesson } from "@/content/demoLessons";
import type { StreamEvent } from "@/domain/scene/schema";
import { parseAnthropicSse, parseSse, UpstreamError, type CompletionStream } from "./chatCompletions";
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

const base = { provider: { name: "gateway" as const, protocol: "openai" as const, endpoint: "https://x", apiKey: "k", model: "test" } };

describe("tutorEvents", () => {
  it("relaie le tour du modèle, validé étape par étape", async () => {
    const text = "```json\n" + serializeLesson(derivativeLesson) + "\n```";
    const events = await collect(
      tutorEvents({ mode: "question", question: "dérivée ?" }, { ...base, completion: fakeCompletion(text) }),
    );
    expect(events[0]).toEqual({ kind: "source", source: "model" });
    expect(events[1]).toMatchObject({ kind: "lesson", title: derivativeLesson.header.title });
    // Le tour s'arrête à la première question posée à l'élève.
    const firstCheck = derivativeLesson.steps.findIndex((step) => step.check);
    expect(events.filter((e) => e.kind === "step")).toHaveLength(firstCheck + 1);
    expect(events.at(-1)).toEqual({ kind: "await" });
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

  it("termine le tour sur la première question, annonce l'attente et coupe le modèle", async () => {
    const check = '{"prompt":"Combien ?","choices":["0","2"],"answer":1}';
    const text = `{"kind":"lesson","title":"Zéros"}\n{"kind":"step","say":"Devine.","check":${check}}\n{"kind":"step","say":"Trop tôt."}`;
    let signal: AbortSignal | undefined;
    const completion: CompletionStream = (options) => {
      signal = options.signal;
      return fakeCompletion(text)(options);
    };
    const events = await collect(tutorEvents({ mode: "question", question: "zéros ?" }, { ...base, completion }));
    expect(events.map((e) => e.kind)).toEqual(["source", "lesson", "step", "await"]);
    expect(signal?.aborted).toBe(true);
  });

  it("signale à la fin du tour les commandes refusées, pour que le modèle les refasse", async () => {
    const check = '{"prompt":"Combien ?","choices":["0","2"],"answer":1}';
    const bad = '{"type":"transform","target":"e1","points":[[0,0],[1,1]]}';
    const text = `{"kind":"lesson","title":"Fourier"}\n{"kind":"step","say":"La courbe se déforme.","do":[${bad}]}\n{"kind":"step","say":"À toi.","check":${check}}`;
    const events = await collect(tutorEvents({ mode: "question", question: "fourier ?" }, { ...base, completion: fakeCompletion(text) }));
    const done = events.at(-1);
    expect(done?.kind).toBe("await");
    expect(done?.kind === "await" && done.rejected?.[0]).toContain("transform");
  });

  it("continue la séance sans nouvel en-tête et transmet la réponse de l'élève au modèle", async () => {
    let prompt = "";
    const completion: CompletionStream = (options) => {
      prompt = options.messages.at(-1)!.content;
      return fakeCompletion('{"kind":"lesson","title":"x"}\n{"kind":"step","say":"Regardons le sommet."}\n{"kind":"end","summary":[]}')(options);
    };
    const events = await collect(
      tutorEvents(
        {
          mode: "continue",
          question: "zéros ?",
          context: { spoken: ["Combien ?"], board: [] },
          answer: { prompt: "Combien ?", choices: ["0", "2"], picked: "0", correct: false },
        },
        { ...base, completion },
      ),
    );
    expect(events.map((e) => e.kind)).toEqual(["source", "step", "end"]);
    expect(prompt).toContain("Réponse de l'élève : « 0 » (faux)");
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

  it("joue la démonstration si le service d'IA refuse l'accès (paiement requis)", async () => {
    const refused: CompletionStream = async function* () {
      throw new UpstreamError("paiement requis", 403);
    };
    const events = await collect(
      tutorEvents({ mode: "question", question: "C'est quoi une dérivée ?" }, { ...base, completion: refused }),
    );
    expect(events.filter((e) => e.kind === "source").at(-1)).toEqual({ kind: "source", source: "demo" });
    expect(events.some((e) => e.kind === "step")).toBe(true);
  });

  it("signale une réponse vide", async () => {
    const events = await collect(
      tutorEvents({ mode: "question", question: "?" }, { ...base, completion: fakeCompletion("Désolé, je ne peux pas.") }),
    );
    expect(events.at(-1)).toMatchObject({ kind: "error", code: "empty" });
  });

  it("joue une séance de démonstration sans clé", async () => {
    const events = await collect(
      tutorEvents({ mode: "question", question: "C'est quoi une dérivée ?" }, { provider: null, completion: fakeCompletion("") }),
    );
    expect(events[0]).toEqual({ kind: "source", source: "demo" });
    expect(events[1]).toMatchObject({ title: derivativeLesson.header.title });

    const other = await collect(
      tutorEvents({ mode: "question", question: "La mitose ?" }, { provider: null, completion: fakeCompletion("") }),
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

describe("parseAnthropicSse", () => {
  const stream = (text: string) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });

  it("garde le texte et ignore la réflexion", async () => {
    const body = [
      "event: message_start",
      'data: {"type":"message_start","message":{}}',
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}',
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Bon"}}',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"jour"}}',
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");
    const out: string[] = [];
    for await (const text of parseAnthropicSse(stream(body))) out.push(text);
    expect(out.join("")).toBe("Bonjour");
  });

  it("transforme un événement d'erreur en exception", async () => {
    const body = 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n';
    await expect(async () => {
      for await (const _ of parseAnthropicSse(stream(body))) void _;
    }).rejects.toThrow("Overloaded");
  });
});
