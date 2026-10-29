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
  it("fait poursuivre un exemple par une tentative au lieu d'accepter une fin sans échange", async () => {
    let calls = 0;
    const completion: CompletionStream = (options) => fakeCompletion((calls++ === 0 ? [
      { kind: "step", say: "Deux exposant trois signifie trois facteurs égaux à deux.", do: [] },
      { kind: "step", say: "Deux fois deux fois deux donne huit.", do: [] },
      { kind: "end", summary: ["Un exposant compte les facteurs"] },
    ] : [{ kind: "step", say: "À toi avec une autre base.", check: { prompt: "Que vaut 3² ?", choices: ["6", "9"], answer: 1 } }]
    ).map((event) => JSON.stringify(event)).join("\n"))(options);
    const events = await collect(tutorEvents({ mode: "question", question: "C'est quoi un exposant ?" }, { ...base, completion }));
    expect(calls).toBe(2);
    expect(events.some((event) => event.kind === "end")).toBe(false);
    expect(events.at(-1)?.kind).toBe("await");
  });

  it("ne déclare pas une difficulté personnelle avant une tentative", async () => {
    const text = [
      { kind: "step", say: "Voici un exemple expliqué." },
      { kind: "end", summary: ["Le principe"], noticed: { strengths: ["Tu sais calculer"], toWork: ["Tu confonds les signes"] } },
    ].map((event) => JSON.stringify(event)).join("\n");
    const events = await collect(tutorEvents({ mode: "question", question: "Montre un exemple résolu sans quiz." }, { ...base, completion: fakeCompletion(text) }));
    expect(events.at(-1)).toMatchObject({ kind: "end" });
    expect(events.at(-1)).not.toHaveProperty("noticed");
  });

  it("permet un refus hors domaine explicite sans imposer un exercice", async () => {
    const events = await collect(tutorEvents({ mode: "question", question: "Explique la mitose." }, { ...base,
      completion: fakeCompletion('{"kind":"step","say":"Je peux t’aider en maths, physique ou chimie."}\n{"kind":"end","reason":"out-of-scope","summary":[]}') }));
    expect(events.at(-1)).toMatchObject({ kind: "end", reason: "out-of-scope" });
  });

  it("refuse un QCM arithmétiquement faux avant de transmettre sa phrase et accepte une réparation", async () => {
    let calls = 0;
    const completion: CompletionStream = (options) => {
      const answer = calls++ === 0 ? 0 : 1;
      return fakeCompletion(JSON.stringify({ kind: "step", say: answer === 0 ? "Question incorrecte." : "Question corrigée.",
        check: { prompt: "Deux fois trois ?", choices: ["5", "6"], answer,
          verification: { kind: "arithmetic", expression: "2*3" } } }))(options);
    };
    const events = await collect(tutorEvents({ mode: "question", question: "Teste-moi." }, { ...base, completion }));
    expect(calls).toBe(2);
    expect(events.filter((event) => event.kind === "step").map((event) => event.say)).toEqual(["Question corrigée."]);
    expect(events.at(-1)?.kind).toBe("await");
  });

  it("utilise le même pipeline génératif quelle que soit la notion demandée", async () => {
    let calls = 0;
    const completion: CompletionStream = async function* () { calls++; yield '{"kind":"step","say":"Je construis une explication adaptée."}\n{"kind":"end","summary":[]}'; };
    const events = await collect(tutorEvents({ mode: "question", question: "C'est quoi le théorème de Thalès ? Sans quiz." }, { ...base, completion }));
    expect(calls).toBe(1);
    expect(events[0]).toEqual({ kind: "source", source: "model" });
    expect(events.at(-1)?.kind).toBe("end");
  });
  it("un plan dynamique ne permet pas de contourner la préférence sans quiz", async () => {
    let calls = 0;
    const completion: CompletionStream = (options) => {
      const events = calls++ === 0 ? [
        { kind: "plan", plan: { goal: "Comprendre", target: "nouveau", concepts: [{ id: "nouveau", label: "Idée", prerequisites: [] }] } },
        { kind: "step", say: "Question prématurée.", teaching: { concept: "nouveau", role: "guided-practice" }, check: { prompt: "?", choices: ["A", "B"], answer: 0 } },
      ] : [
        { kind: "step", say: "Voici une résolution complète.", teaching: { concept: "nouveau", role: "worked-example", completes: true } },
        { kind: "end", summary: [] },
      ];
      return fakeCompletion(events.map((e) => JSON.stringify(e)).join("\n"))(options);
    };
    const events = await collect(tutorEvents({ mode: "question", question: "Explique sans quiz." }, { ...base, completion }));
    expect(calls).toBe(2);
    expect(events.some((e) => e.kind === "plan")).toBe(true);
    expect(events.some((e) => e.kind === "await" || e.kind === "step" && e.check)).toBe(false);
    expect(events.filter((e) => e.kind === "step").map((e) => e.say)).toEqual(["Voici une résolution complète."]);
    expect(events.at(-1)?.kind).toBe("end");
  });
  it("réessaie une seule fois sans réflexion si le budget est épuisé avant de parler", async () => {
    const efforts: Array<string | undefined> = [];
    const completion: CompletionStream = async function* (options) {
      efforts.push(options.reasoningEffort);
      if (efforts.length === 1) throw new UpstreamError("limite", undefined, "token_limit");
      yield '{"kind":"step","say":"Voici un exemple résolu."}\n{"kind":"end","summary":[]}';
    };
    const events = await collect(tutorEvents({ mode: "question", question: "Explique le double sans quiz." }, { provider: { ...base.provider, firstTurnEffort: "low" }, completion }));
    expect(efforts).toEqual(["low", "none"]);
    expect(events.at(-1)?.kind).toBe("end");
  });

  it("ne boucle pas et ne rejoue pas les étapes déjà transmises après une limite", async () => {
    let calls = 0;
    const exhausted: CompletionStream = async function* () { calls++; throw new UpstreamError("limite", undefined, "token_limit"); };
    const config = { provider: { ...base.provider, firstTurnEffort: "low" as const }, completion: exhausted };
    const empty = await collect(tutorEvents({ mode: "question", question: "Explique." }, config));
    expect(calls).toBe(2);
    expect(empty.at(-1)?.kind).toBe("error");
    calls = 0;
    const partial: CompletionStream = async function* () { calls++; yield '{"kind":"step","say":"Déjà dit."}\n'; throw new UpstreamError("limite", undefined, "token_limit"); };
    const interrupted = await collect(tutorEvents({ mode: "question", question: "Explique." }, { ...config, completion: partial }));
    expect(calls).toBe(1);
    expect(interrupted.at(-1)?.kind).toBe("error");
  });
  it("répare une question interdite sans la faire entendre ni attendre sa réponse", async () => {
    let calls = 0;
    const signals: AbortSignal[] = [];
    const completion: CompletionStream = (options) => {
      signals.push(options.signal!);
      const text = calls++ === 0
        ? '{"kind":"step","say":"Une entrée donne une sortie."}\n{"kind":"step","say":"Devine la sortie.","check":{"prompt":"Combien ?","choices":["3","6"],"answer":1}}'
        : '{"kind":"step","say":"Par exemple, doubler 3 donne 3 fois 2, donc 6."}\n{"kind":"end","summary":["Doubler, c’est multiplier par deux"]}';
      if (calls === 2) {
        expect(options.messages.at(-1)?.content).toContain("CORRECTION DU CONTRÔLEUR");
        expect(options.messages.at(-2)?.content).toContain("Une entrée donne une sortie.");
        expect(options.messages.at(-2)?.content).not.toContain("Devine");
      }
      return fakeCompletion(text)(options);
    };
    const events = await collect(tutorEvents({ mode: "question", question: "Explique le double sans quiz." }, { ...base, completion }));
    expect(calls).toBe(2);
    expect(events.filter((e) => e.kind === "step").map((e) => e.say)).toEqual(["Une entrée donne une sortie.", "Par exemple, doubler 3 donne 3 fois 2, donc 6."]);
    expect(events.some((e) => e.kind === "await" || (e.kind === "step" && e.check))).toBe(false);
    expect(events.at(-1)?.kind).toBe("end");
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it("s'arrête après une réparation refusée et ne présente pas une réussite fictive", async () => {
    let calls = 0;
    const completion: CompletionStream = (options) => {
      calls++;
      return fakeCompletion('{"kind":"step","say":"Devine.","check":{"prompt":"?","choices":["1","2"],"answer":0}}')(options);
    };
    const events = await collect(tutorEvents({ mode: "question", question: "Explique sans quiz." }, { ...base, completion }));
    expect(calls).toBe(2);
    expect(events.filter((e) => e.kind === "step")).toEqual([]);
    expect(events.filter((e) => e.kind === "error")).toHaveLength(1);
    expect(events.some((e) => e.kind === "end" || e.kind === "await")).toBe(false);
  });

  it("ne relance pas un cycle de génération si la réparation est vide", async () => {
    let calls = 0;
    const completion: CompletionStream = (options) => fakeCompletion(calls++ === 0
      ? '{"kind":"step","say":"Devine.","check":{"prompt":"?","choices":["1","2"],"answer":0}}' : "")(options);
    const events = await collect(tutorEvents({ mode: "question", question: "Explique sans quiz." }, { ...base, completion }));
    expect(calls).toBe(2);
    expect(events.at(-1)?.kind).toBe("error");
    expect(events.some((e) => e.kind === "end")).toBe(false);
  });

  it("laisse finir un exemple après douze petites étapes au lieu de le couper avant son résultat", async () => {
    const text = Array.from({ length: 13 }, (_, i) => JSON.stringify({ kind: "step", say: `Étape ${i + 1}.` })).join("\n") + '\n{"kind":"end","summary":["Résultat"]}';
    const events = await collect(tutorEvents({ mode: "question", question: "Explique un calcul sans quiz." }, { ...base, completion: fakeCompletion(text) }));
    expect(events.filter((e) => e.kind === "step")).toHaveLength(13);
    expect(events.at(-1)).toMatchObject({ kind: "end", summary: ["Résultat"] });
  });

  it("demande le complément manquant avant d'accepter la fin d'une découverte", async () => {
    let calls = 0;
    const completion: CompletionStream = (options) => {
      const events = calls++ === 0 ? [
        { kind: "plan", plan: { goal: "Comprendre", target: "parts-séance", concepts: [{ id: "parts-séance", label: "Parts égales", prerequisites: [] }] } },
        { kind: "step", say: "Une fraction compte des parts égales d'un tout.", teaching: { concept: "parts-séance", role: "explanation", completes: true } },
        { kind: "end", summary: [] },
      ] : [
        { kind: "step", say: "Je partage une unité en 4 parts égales et j'en prends 3 : cela donne trois quarts, soit 3/4.", teaching: { concept: "parts-séance", role: "worked-example", completes: true } },
        { kind: "end", summary: ["Le 4 décrit le partage, le 3 ce qu'on prend"] },
      ];
      return fakeCompletion(events.map((e) => JSON.stringify(e)).join("\n"))(options);
    };
    const events = await collect(tutorEvents({ mode: "question", question: "C'est quoi une fraction ? Sans quiz." }, { ...base, completion }));
    expect(calls).toBe(2);
    expect(events.filter((e) => e.kind === "end")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "step")).toHaveLength(2);
  });

  it("relaie le tour du modèle, validé étape par étape", async () => {
    const text = "```json\n" + serializeLesson(derivativeLesson) + "\n```";
    const events = await collect(
      tutorEvents({ mode: "question", question: "Teste-moi." }, { ...base, completion: fakeCompletion(text) }),
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
      tutorEvents({ mode: "question", question: "Pourquoi le ciel est bleu ? Sans quiz." }, { ...base, completion: fakeCompletion(text) }),
    );
    expect(events.map((e) => e.kind)).toEqual(["source", "lesson", "step", "step", "end"]);
  });

  // Homothétie, 21 octobre : une accolade oubliée avalait la question, et la séance s'arrêtait au premier tour.
  it("garde l'étape et la question qui suivent un objet resté ouvert", async () => {
    const text =
      '{"kind":"step","say":"Voici le centre O.","do":[{"type":"point","id":"O","at":[0,0]}]\n' +
      '{"kind":"step","say":"Que devient AB ?","check":{"prompt":"Que devient AB ?","choices":["Il double","Il reste pareil"],"answer":0}}';
    const events = await collect(tutorEvents({ mode: "question", question: "Teste-moi sur l'homothétie." }, { ...base, completion: fakeCompletion(text) }));
    expect(events.map((e) => e.kind)).toEqual(["source", "lesson", "step", "step", "await"]);
    expect(events[2]).toMatchObject({ say: "Voici le centre O.", do: [{ type: "point", id: "O" }] });
  });

  it("ne renvoie pas d'en-tête pour une réponse à une interruption", async () => {
    const text = '{"kind":"lesson","title":"x"}\n{"kind":"step","say":"Je reformule."}\n{"kind":"end","summary":[]}';
    const events = await collect(
      tutorEvents(
        { mode: "followUp", question: "Explique sans quiz.", context: { spoken: [], board: [] } },
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
    const events = await collect(tutorEvents({ mode: "question", question: "Teste-moi sur les zéros." }, { ...base, completion }));
    expect(events.map((e) => e.kind)).toEqual(["source", "lesson", "step", "await"]);
    expect(signal?.aborted).toBe(true);
  });

  it("signale à la fin du tour les commandes refusées, pour que le modèle les refasse", async () => {
    const check = '{"prompt":"Combien ?","choices":["0","2"],"answer":1}';
    const bad = '{"type":"transform","target":"e1","points":[[0,0],[1,1]]}';
    const text = `{"kind":"lesson","title":"Fourier"}\n{"kind":"step","say":"La courbe se déforme.","do":[${bad}]}\n{"kind":"step","say":"À toi.","check":${check}}`;
    const events = await collect(tutorEvents({ mode: "question", question: "Teste-moi sur Fourier." }, { ...base, completion: fakeCompletion(text) }));
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
          context: { spoken: ["Combien ?"], board: [], originalQuestion: "Explique sans quiz." },
          answer: { prompt: "Combien ?", choices: ["0", "2"], picked: "0", correct: false },
        },
        { ...base, completion },
      ),
    );
    expect(events.map((e) => e.kind)).toEqual(["source", "step", "end"]);
    expect(prompt).toContain("Réponse de l'élève : « 0 » (faux)");
  });

  it("transmet la fiche de diagnostic sans finir le tour, puis s'arrête à la question", async () => {
    const lines = [
      { kind: "step", say: "Tu as écrit 2 sur 7.", do: [] },
      { kind: "diagnosis", gaps: [{ notion: "fractions : dénominateur commun", level: "sec 1", evidence: "1/3 + 1/4 = 2/7", status: "suspected" }], strengths: [], next: "vérifier les fractions" },
      { kind: "step", say: "Petite vérification.", do: [], check: { prompt: "1/2 + 1/4 ?", choices: ["2/6", "3/4"], answer: 1 } },
      { kind: "step", say: "Jamais joué.", do: [] },
    ].map((l) => JSON.stringify(l)).join("\n");
    const events = await collect(
      tutorEvents(
        { mode: "continue", question: "?", context: { spoken: [], board: [] }, answer: { prompt: "1/3 + 1/4 ?", choices: ["7/12", "2/7"], picked: "2/7", correct: null } },
        { ...base, completion: fakeCompletion(lines) },
      ),
    );
    expect(events.map((e) => e.kind)).toEqual(["source", "step", "diagnosis", "step", "await"]);
    expect(events[2]).toMatchObject({ gaps: [{ status: "suspected", notion: "fractions : dénominateur commun" }] });
  });

  it("redemande une fois quand le modèle ne renvoie aucune étape, puis joue le second essai", async () => {
    let calls = 0;
    const completion: CompletionStream = (options) => {
      calls++;
      return fakeCompletion(calls === 1 ? "Je réfléchis encore…" : '{"kind":"step","say":"Voici.","do":[]}\n{"kind":"end","summary":[]}')(options);
    };
    const events = await collect(tutorEvents({ mode: "question", question: "Explique sans quiz." }, { ...base, completion }));
    expect(calls).toBe(2);
    expect(events.map((e) => e.kind)).toEqual(["source", "lesson", "step", "end"]);
  });

  it("n'insiste pas plus d'une fois : deux tours vides donnent l'erreur", async () => {
    let calls = 0;
    const completion: CompletionStream = (options) => {
      calls++;
      return fakeCompletion("rien d'utilisable")(options);
    };
    const events = await collect(tutorEvents({ mode: "question", question: "?" }, { ...base, completion }));
    expect(calls).toBe(2);
    expect(events.at(-1)).toMatchObject({ kind: "error", code: "empty" });
  });

  it("signale une erreur si le modèle échoue avant la première étape", async () => {
    const events = await collect(
      tutorEvents({ mode: "question", question: "?" }, { ...base, completion: fakeCompletion("{}", 0) }),
    );
    expect(events.at(-1)).toMatchObject({ kind: "error", code: "upstream" });
  });

  it("signale une interruption si le modèle coupe en cours de séance", async () => {
    const text = '{"kind":"step","say":"Une."}\n{"kind":"step","say":"Deux."}\n{"kind":"step","say":"Trois."}';
    const events = await collect(
      tutorEvents({ mode: "question", question: "?" }, { ...base, completion: fakeCompletion(text, 30) }),
    );
    expect(events.filter((e) => e.kind === "step").length).toBeGreaterThan(0);
    expect(events.at(-1)).toMatchObject({ kind: "error", code: "upstream" });
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

  it("signale une réponse coupée par la limite de jetons", async () => {
    const body = 'data: {"choices":[{"delta":{"content":"{\\"kind\\":"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n';
    await expect(async () => {
      for await (const _ of parseSse(stream(body))) void _;
    }).rejects.toThrow("limite de jetons");
  });

  it("détecte une coupure réseau sans marqueur DONE", async () => {
    await expect(async () => {
      for await (const _ of parseSse(stream('data: {"choices":[{"delta":{"content":"Bonjour"}}]}\n\n'))) void _;
    }).rejects.toThrow("interrompu");
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

  it("détecte une coupure Anthropic sans message_stop", async () => {
    await expect(async () => {
      for await (const _ of parseAnthropicSse(stream('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Bonjour"}}\n\n'))) void _;
    }).rejects.toThrow("interrompu");
  });

  it("transforme un événement d'erreur en exception", async () => {
    const body = 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n';
    await expect(async () => {
      for await (const _ of parseAnthropicSse(stream(body))) void _;
    }).rejects.toThrow("Overloaded");
  });
});
