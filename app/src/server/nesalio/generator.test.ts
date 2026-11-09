import { describe, expect, it } from "vitest";
import type { ChatProvider } from "@/server/config";
import type { CompletionOptions } from "@/server/tutor/chatCompletions";
import { closeJsonLine, generateNesalio, MAX_REPAIRS, MAX_SLICES, type NesalioEvent } from "./generator";

const provider: ChatProvider = { name: "gateway", protocol: "openai", endpoint: "https://example.test", apiKey: "k", model: "m", firstTurnEffort: "none" };
const header = JSON.stringify({ lesson: { id: "l", title: "Titre", language: "fr", learning_goal: "But" }, math_context: { symbols: {}, expressions: {} } });

function slice(id: string, objectId = `o_${id}`, cueText = "point") {
  return JSON.stringify({ slice: {
    slice_id: id,
    introduces: [{ id: objectId, type: "point", params: { at: [0, 0] } }],
    beats: [{ id: `b_${id}`, say: "Voici un point.", cues: [{ id: "c", text: cueText }], do: [{ id: `a_${id}`, verb: "show", target: objectId, at: "cue:c" }] }],
  } });
}

/** A fake model: one scripted answer per call, delivered in small uneven chunks. */
function scripted(...answers: string[]) {
  const calls: CompletionOptions[] = [];
  const completion = (options: CompletionOptions) => {
    calls.push(options);
    const text = answers[calls.length - 1] ?? "";
    return (async function* () {
      for (let i = 0; i < text.length; i += 7) yield text.slice(i, i + 7);
    })();
  };
  return { completion, calls };
}

async function run(completion: ReturnType<typeof scripted>["completion"]) {
  const events: NesalioEvent[] = [];
  for await (const event of generateNesalio("Explique-moi un point", { provider, completion })) events.push(event);
  return events;
}
const kinds = (events: NesalioEvent[]) => events.map((event) => event.kind === "slice" ? `slice:${event.slice.slice_id}` : event.kind);

describe("générateur Nesalio", () => {
  it("transmet chaque tranche validée dès qu’elle est complète, sans réflexion avant la première", async () => {
    const model = scripted(["```json", header, slice("s1"), slice("s2"), "```"].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]).toMatchObject({ model: "m", reasoningEffort: "none", maxTokens: 16_000 });
    expect(model.calls[0]!.messages[0]!.role).toBe("system");
  });

  it("renvoie une tranche refusée au modèle avec ses erreurs, puis continue après la correction", async () => {
    const model = scripted(
      [header, slice("s1"), slice("s2", "o_s2", "trian")].join("\n"),
      // The model rewrites an accepted tranche before the corrected one: it is skipped, not refused.
      [slice("s1"), slice("s2"), slice("s3")].join("\n"),
    );
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
    expect(model.calls).toHaveLength(2);
    const repair = model.calls[1]!.messages;
    expect(repair.at(-2)).toMatchObject({ role: "assistant", content: [header, slice("s1")].join("\n") });
    expect(repair.at(-1)!.content).toContain("« s2 » a été refusée");
    expect(repair.at(-1)!.content).toContain("mots entiers");
  });

  it("ne joue jamais une tranche restée invalide après la correction, et garde ce qui était valide", async () => {
    const bad = slice("s2", "o_s2", "trian");
    const model = scripted([header, slice("s1"), bad].join("\n"), bad);
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
    expect(model.calls).toHaveLength(2);
  });

  it("refuse un geste que le lecteur ne sait pas jouer, même s’il est dans le contrat", async () => {
    const transform = JSON.stringify({ slice: {
      slice_id: "s1", introduces: [{ id: "a", type: "math", content: "x" }, { id: "b", type: "math", content: "y" }],
      beats: [{ id: "b1", say: "On réorganise.", cues: [], do: [{ id: "r", verb: "layout.reflow", targets: ["a", "b"], intent: "aligner", at: "beat:start" }] }],
    } });
    const model = scripted([header, transform].join("\n"), slice("s1"));
    const events = await run(model.completion);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "end"]);
    expect(model.calls[1]!.messages.at(-1)!.content).toContain("Capacité non exécutable « layout.reflow »");
  });

  it("signale une réponse sans tranche, une coupure du modèle et une explication jamais valide", async () => {
    expect(await run(scripted("Je ne sais pas.").completion)).toMatchObject([{ kind: "error", code: "empty" }]);
    const failing = () => (async function* () { yield [header, slice("s1"), ""].join("\n"); throw new Error("coupure"); })();
    expect(kinds(await run(failing))).toEqual(["lesson", "slice:s1", "error"]);
    const neverValid = scripted([header, slice("s1", "o", "trian")].join("\n"), slice("s1", "o", "trian"));
    expect(await run(neverValid.completion)).toMatchObject([{ kind: "lesson" }, { kind: "error", code: "invalid" }]);
  });

  it("accepte une ligne à laquelle il ne manque que ses dernières accolades fermantes", async () => {
    // Seen in real generations: the header ends with `"expressions": {}}`, one `}` short.
    const model = scripted([header.slice(0, -1), slice("s1").slice(0, -2)].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
    expect(model.calls).toHaveLength(1);
  });

  it("ne complète pas une ligne coupée au milieu d’une valeur", async () => {
    expect(closeJsonLine('{"slice": {"at": [0, 1')).toBeUndefined();
    expect(closeJsonLine('{"say": "Voici')).toBeUndefined();
    expect(closeJsonLine('{"a": [1}')).toBeUndefined();
    expect(closeJsonLine('{"a": {"b": "}"}')).toBe('{"a": {"b": "}"}}');
  });

  it("redemande la ligne lesson quand l’en-tête manquait avant la tranche refusée", async () => {
    const model = scripted(["{\"lesson\": oups", slice("s1")].join("\n"), [header, slice("s1")].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
    expect(model.calls[1]!.messages.at(-1)!.content).toContain("ligne {\"lesson\"");
  });

  it("corrige chaque tranche refusée une fois, pas seulement la première de la leçon", async () => {
    const model = scripted(
      [header, slice("s1"), slice("s2", "o_s2", "trian")].join("\n"),
      [slice("s2"), slice("s3", "o_s3", "trian")].join("\n"),
      [slice("s3"), slice("s4")].join("\n"),
    );
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "slice:s4", "end"]);
    expect(model.calls).toHaveLength(3);
  });

  it("borne le nombre total de corrections d’une leçon", async () => {
    const answers = [[header, slice("s1", "o1", "trian")].join("\n"),
      ...Array.from({ length: MAX_REPAIRS + 2 }, (_, i) => [slice(`s${i + 1}`, `o${i + 1}`), slice(`s${i + 2}`, `o${i + 2}`, "trian")].join("\n"))];
    const model = scripted(...answers);
    const events = await run(model.completion);
    expect(model.calls).toHaveLength(MAX_REPAIRS + 1);
    expect(events.at(-1)).toEqual({ kind: "end" });
  });

  it("refuse un en-tête dont le contexte mathématique est faux et ne redemande que la ligne lesson", async () => {
    const badHeader = JSON.stringify({ lesson: { id: "l", title: "Titre", language: "fr", learning_goal: "But" },
      math_context: { symbols: { a: { kind: "parameter", initial: 9, min: 0, max: 2 } }, expressions: {} } });
    const model = scripted([badHeader, slice("s1")].join("\n"), [header, slice("s1")].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
    const repair = model.calls[1]!.messages.at(-1)!.content;
    expect(repair).toContain("ligne {\"lesson\"");
    expect(repair).toContain("intervalle déclaré");
  });

  it("retire sans appel de l’en-tête une expression écrite en x", async () => {
    // Seen in real generations: the curve's formula put in math_context.expressions, where only symbols exist.
    const withCurve = JSON.stringify({ lesson: { id: "l", title: "Titre", language: "fr", learning_goal: "But" }, math_context: { symbols: {}, expressions: { f: "log(x)" } } });
    const model = scripted([withCurve, slice("s1")].join("\n"));
    const events = await run(model.completion);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "end"]);
    expect(events[0]).toMatchObject({ math_context: { expressions: {} } });
    expect(model.calls).toHaveLength(1);
  });

  it("demande une fois la suite quand le modèle s’arrête avant le nombre minimal de tranches", async () => {
    // Seen in real generations: the first tranche corrected, then nothing more.
    const model = scripted(
      [header, slice("s1", "o1", "trian")].join("\n"),
      slice("s1", "o1"),
      [slice("s2", "o2"), slice("s3", "o3")].join("\n"),
    );
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
    expect(model.calls).toHaveLength(3);
    expect(model.calls[2]!.messages.at(-1)!.content).toContain("Continue");
    // Asked once only: a model that still writes nothing ends the lesson with what it has.
    const stubborn = scripted([header, slice("s1", "o1", "trian")].join("\n"), slice("s1", "o1"), "", "");
    expect(kinds(await run(stubborn.completion))).toEqual(["lesson", "slice:s1", "end"]);
    expect(stubborn.calls).toHaveLength(3);
    // Without a correction, a short lesson is the model's choice: no extra call.
    const short = scripted([header, slice("s1")].join("\n"), "");
    await run(short.completion);
    expect(short.calls).toHaveLength(1);
  });

  it("répare sans appel au modèle une faute de forme sûre, comme un repère nommé sans son préfixe", async () => {
    const unprefixed = slice("s1").replace('"cue:c"', '"cue:point"');
    const model = scripted([header, unprefixed].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
    expect(model.calls).toHaveLength(1);
  });

  it("répare sans appel un part visant une formule non découpée déclarée dans une tranche précédente", async () => {
    const formula = JSON.stringify({ slice: {
      slice_id: "s1", introduces: [{ id: "eq", type: "math", content: "3x = 12" }],
      beats: [{ id: "b1", say: "Voici l'équation.", cues: [{ id: "c", text: "équation" }], do: [{ id: "w", verb: "write", target: "eq", at: "cue:c" }] }],
    } });
    const withPart = JSON.stringify({ slice: {
      slice_id: "s2", introduces: [],
      beats: [{ id: "b2", say: "Regarde le résultat.", cues: [{ id: "c", text: "résultat" }], do: [{ id: "h", verb: "highlight", target: "eq", part: "droite", role: "accent", at: "cue:c" }] }],
    } });
    const model = scripted([header, formula, withPart].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
    expect(model.calls).toHaveLength(1);
  });

  it("s’arrête au nombre maximal de tranches", async () => {
    const many = Array.from({ length: MAX_SLICES + 2 }, (_, i) => slice(`s${i}`));
    const events = await run(scripted([header, ...many].join("\n")).completion);
    expect(events.filter((event) => event.kind === "slice")).toHaveLength(MAX_SLICES);
    expect(events.at(-1)).toEqual({ kind: "end" });
  });
});
