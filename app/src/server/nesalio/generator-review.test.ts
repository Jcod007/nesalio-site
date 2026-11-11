/** Relecteur de fond branché dans le générateur (review.ts) : modèle qui écrit et relecteur simulés. */
import { describe, expect, it } from "vitest";
import type { Slice } from "@/domain/nesalio/contract";
import type { ChatProvider } from "@/server/config";
import type { CompletionOptions } from "@/server/tutor/chatCompletions";
import { generateNesalio, MAX_REVIEW_FIXES, type NesalioEvent } from "./generator";
import type { ReviewInput, ReviewResult, SliceReviewer } from "./review";

const provider: ChatProvider = { name: "gateway", protocol: "openai", endpoint: "https://example.test", apiKey: "k", model: "m", firstTurnEffort: "none" };
const header = JSON.stringify({ lesson: { id: "l", title: "Titre", language: "fr", learning_goal: "But" }, math_context: { symbols: {}, expressions: {} } });

function slice(id: string, say = "Voici un point.", cueText = say.split(" ")[0]!) {
  return JSON.stringify({
    slice: {
      slice_id: id,
      introduces: [{ id: `o_${id}`, type: "point", params: { at: [0, 0] } }],
      beats: [{ id: `b_${id}`, say, cues: [{ id: "c", text: cueText }], do: [{ id: `a_${id}`, verb: "show", target: `o_${id}`, at: "cue:c" }] }],
    },
  });
}

/** Une ouverture : des mots seulement (reformuler la question, annoncer la suite), sans données. */
function opening(id: string, say = "Tu veux savoir comment on additionne. On le voit ensemble.") {
  return JSON.stringify({
    slice: {
      slice_id: id,
      introduces: [{ id: `o_${id}`, type: "text", content: "Additionner" }],
      beats: [{ id: `b_${id}`, say, cues: [{ id: "c", text: say.split(" ")[0]! }], do: [{ id: `a_${id}`, verb: "write", target: `o_${id}`, at: "cue:c" }] }],
    },
  });
}

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

/** Un relecteur simulé : une alerte pour chaque tranche dont la voix contient `wrong`. */
function reviewer(wrong: string, extra: Partial<ReviewResult> = {}) {
  const seen: ReviewInput[] = [];
  const review: SliceReviewer = async (input) => {
    seen.push(input);
    const say = input.slice.beats.map((b) => b.say).join(" ");
    return { alerts: say.includes(wrong) ? [{ citation: wrong, correction: "c'est 7, pas 8", type: "calcul" }] : [], dropped: [], ms: 1, ...extra };
  };
  return { review, seen };
}

async function run(completion: ReturnType<typeof scripted>["completion"], review?: SliceReviewer, reviewTimeoutMs?: number) {
  const events: NesalioEvent[] = [];
  const logs: string[] = [];
  for await (const event of generateNesalio("Combien font 3 + 4 ?", {
    provider,
    completion,
    ...(review ? { review } : {}),
    ...(reviewTimeoutMs ? { reviewTimeoutMs } : {}),
    log: (message, detail) => logs.push(`${message} ${String(detail ?? "")}`),
  }))
    events.push(event);
  return { events, logs };
}
const kinds = (events: NesalioEvent[]) => events.map((event) => (event.kind === "slice" ? `slice:${event.slice.slice_id}` : event.kind));
const sayOf = (events: NesalioEvent[], id: string) =>
  (events.find((e) => e.kind === "slice" && e.slice.slice_id === id) as { slice: Slice }).slice.beats[0]!.say;

describe("générateur Nesalio avec relecteur", () => {
  it("ne relit pas une ouverture sans données, relit les tranches suivantes avec le contexte déjà montré", async () => {
    const model = scripted([header, opening("s1"), slice("s2"), slice("s3")].join("\n"));
    const { review, seen } = reviewer("jamais");
    const { events } = await run(model.completion, review);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
    expect(seen.map((s) => s.slice.slice_id)).toEqual(["s2", "s3"]);
    expect(seen[1]!.previous.map((s) => s.slice_id)).toEqual(["s1", "s2"]);
    expect(seen[0]!.question).toBe("Combien font 3 + 4 ?");
    expect(model.calls).toHaveLength(1);
  });

  it("relit une première tranche qui porte des données (figure, nombres), et la fait corriger avant de la montrer", async () => {
    const model = scripted(
      [header, slice("s1", "Trois plus quatre font huit."), slice("s2")].join("\n"),
      [slice("s1", "Trois plus quatre font sept."), slice("s2")].join("\n"),
    );
    const { review, seen } = reviewer("font huit");
    const { events } = await run(model.completion, review);
    expect(seen[0]!.slice.slice_id).toBe("s1");
    expect(seen[0]!.previous).toEqual([]);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
    expect(sayOf(events, "s1")).toBe("Trois plus quatre font sept.");
  });

  it("renvoie au modèle une tranche signalée, ne la montre jamais, et montre la version corrigée", async () => {
    const model = scripted(
      [header, opening("s1"), slice("s2", "Trois plus quatre font huit."), slice("s3", "Donc huit.")].join("\n"),
      [slice("s2", "Trois plus quatre font sept."), slice("s3", "Donc sept.")].join("\n"),
    );
    const { review, seen } = reviewer("font huit");
    const { events, logs } = await run(model.completion, review);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
    expect(sayOf(events, "s2")).toBe("Trois plus quatre font sept.");
    // The tranche written after the faulty one is dropped with the call, then rewritten.
    expect(sayOf(events, "s3")).toBe("Donc sept.");
    expect(model.calls).toHaveLength(2);
    const fix = model.calls[1]!.messages;
    expect(fix.at(-1)!.content).toContain("Un relecteur a trouvé des erreurs de fond dans la tranche « s2 »");
    expect(fix.at(-1)!.content).toContain("« font huit » → c'est 7, pas 8");
    // The faulty tranche is shown back, after the accepted ones, to be edited.
    expect(fix.at(-2)!.content.split("\n").at(-1)).toContain("Trois plus quatre font huit.");
    // The corrected tranche is not read again; the next one is.
    expect(seen.map((s) => s.slice.slice_id)).toEqual(["s2", "s3"]);
    expect(logs).toContainEqual(expect.stringMatching(/^nesalio: alerte du relecteur s2 — « font huit »/));
  });

  it("limite les corrections du relecteur par leçon, sans arrêter la leçon", async () => {
    const model = scripted(
      [header, opening("s1"), slice("s2", "Faux deux.")].join("\n"),
      [slice("s2", "Juste deux."), slice("s3", "Faux trois.")].join("\n"),
      [slice("s3", "Juste trois."), slice("s4", "Faux quatre.")].join("\n"),
    );
    const { review, seen } = reviewer("Faux");
    const { events } = await run(model.completion, review);
    expect(MAX_REVIEW_FIXES).toBe(2);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "slice:s4", "end"]);
    // Past the budget the tranche is shown as written, unreviewed.
    expect(sayOf(events, "s4")).toBe("Faux quatre.");
    expect(seen.map((s) => s.slice.slice_id)).toEqual(["s2", "s3"]);
    expect(model.calls).toHaveLength(3);
  });

  it("ne compte pas une correction du relecteur dans le budget des refus du moteur", async () => {
    // s2 flagged by the reviewer, then its correction refused twice by the contract (unknown cue): the
    // contract's own limit per tranche (MAX_ATTEMPTS = 2) still allows both repairs.
    const model = scripted(
      [header, opening("s1"), slice("s2", "Faux deux.")].join("\n"),
      slice("s2", "Juste deux.", "absent"),
      slice("s2", "Juste deux.", "absent"),
      slice("s2", "Juste deux."),
    );
    const { review } = reviewer("Faux");
    const { events } = await run(model.completion, review);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
    expect(sayOf(events, "s2")).toBe("Juste deux.");
  });

  it("montre la tranche sans relecture si le relecteur échoue", async () => {
    const model = scripted([header, opening("s1"), slice("s2")].join("\n"));
    const review: SliceReviewer = async () => {
      throw new Error("HTTP 503");
    };
    const { events, logs } = await run(model.completion, review);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
    expect(logs).toContainEqual(expect.stringMatching(/^nesalio: relecture impossible, tranche montrée sans relecture s2 — HTTP 503/));
  });

  it("montre la tranche sans relecture si le relecteur est trop lent", async () => {
    const model = scripted([header, opening("s1"), slice("s2")].join("\n"));
    const review: SliceReviewer = () => new Promise(() => undefined);
    const { events, logs } = await run(model.completion, review, 30);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
    expect(logs).toContainEqual(expect.stringMatching(/pas de réponse après/));
  });

  it("relit chaque tranche quand deux tranches sont sur une même ligne", async () => {
    const model = scripted([header, opening("s1"), `${slice("s2")}${slice("s3")}`].join("\n"));
    const { review, seen } = reviewer("jamais");
    const { events } = await run(model.completion, review);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
    expect(seen.map((s) => s.slice.slice_id)).toEqual(["s2", "s3"]);
  });

  it("sans relecteur, rien ne change", async () => {
    const model = scripted([header, opening("s1"), slice("s2", "Trois plus quatre font huit.")].join("\n"));
    const { events } = await run(model.completion);
    expect(sayOf(events, "s2")).toBe("Trois plus quatre font huit.");
  });
});
