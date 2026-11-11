import { describe, expect, it } from "vitest";
import type { ChatProvider } from "@/server/config";
import { UpstreamError, type CompletionOptions } from "@/server/tutor/chatCompletions";
import { closeJsonLine, generateNesalio, MAX_ATTEMPTS, MAX_REPAIRS, MAX_SLICES, type NesalioEvent } from "./generator";

const provider: ChatProvider = { name: "gateway", protocol: "openai", endpoint: "https://example.test", apiKey: "k", model: "m", firstTurnEffort: "none" };
const header = JSON.stringify({ lesson: { id: "l", title: "Titre", language: "fr", learning_goal: "But" }, math_context: { symbols: {}, expressions: {} } });

function slice(id: string, objectId = `o_${id}`, cueText = "point") {
  return JSON.stringify({
    slice: {
      slice_id: id,
      introduces: [{ id: objectId, type: "point", params: { at: [0, 0] } }],
      beats: [
        { id: `b_${id}`, say: "Voici un point.", cues: [{ id: "c", text: cueText }], do: [{ id: `a_${id}`, verb: "show", target: objectId, at: "cue:c" }] },
      ],
    },
  });
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

async function run(completion: ReturnType<typeof scripted>["completion"], options: { idleTimeoutMs?: number } = {}) {
  const events: NesalioEvent[] = [];
  for await (const event of generateNesalio("Explique-moi un point", { provider, completion, ...options })) events.push(event);
  return events;
}
const kinds = (events: NesalioEvent[]) => events.map((event) => (event.kind === "slice" ? `slice:${event.slice.slice_id}` : event.kind));

describe("générateur Nesalio", () => {
  it("transmet une question à l'élève après la tranche qui la précède, et écarte une question mal formée", async () => {
    const question = (id: string, extra: Record<string, unknown> = {}) =>
      JSON.stringify({
        question: {
          id,
          prompt: "Combien de points ?",
          choices: ["un", "deux"],
          answer: 0,
          ifRight: "Oui.",
          ifWrong: "Non.",
          ...extra,
        },
      });
    const model = scripted([header, slice("s1"), question("q1"), slice("s2"), question("q2", { answer: 5 }), slice("s3")].join("\n"));
    const events = await run(model.completion);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "question", "slice:s2", "slice:s3", "end"]);
    expect(events[2]).toMatchObject({ kind: "question", id: "q1", after: "s1", check: { answer: 0, choices: ["un", "deux"] } });
    // A wrong question never stops the lesson, nor asks the model again.
    expect(model.calls).toHaveLength(1);
  });

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
    // Lot 2 (cycle 2): the refused line is shown after the accepted ones, to be edited rather than rewritten from memory.
    expect(repair.at(-2)).toMatchObject({ role: "assistant", content: [header, slice("s1"), slice("s2", "o_s2", "trian")].join("\n") });
    expect(repair.at(-1)!.content).toContain("« s2 » a été refusée");
    expect(repair.at(-1)!.content).toContain("mots entiers");
    expect(repair.at(-1)!.content).toContain("Ta ligne refusée est ci-dessus : recopie-la en ne changeant que les champs cités");
    // Each refusal quotes the value found at its path.
    expect(repair.at(-1)!.content).toContain('(valeur reçue : "trian")');
  });

  it("tronque la valeur reçue citée dans un refus", async () => {
    const long = "un point ".repeat(20).trim();
    const model = scripted([header, slice("s1", "o1", long.replace("point", "poin"))].join("\n"), slice("s1", "o1"));
    await run(model.completion);
    const repair = model.calls[1]!.messages.at(-1)!.content;
    expect(repair).toMatch(/valeur reçue : "un poin un point[^)]{60,80}…\)/);
  });

  it("ne joue jamais une tranche restée invalide après ses corrections, et garde ce qui était valide", async () => {
    const bad = slice("s2", "o_s2", "trian");
    const model = scripted([header, slice("s1"), bad].join("\n"), bad, bad);
    const events = await run(model.completion);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "error"]);
    // Seen by the user: a lesson cut short was announced as finished. It is now said to be incomplete.
    expect(events.at(-1)).toMatchObject({ kind: "error", code: "incomplete" });
    // Plus the one simplified rewrite (last chance), refused too.
    expect(model.calls).toHaveLength(2 + MAX_ATTEMPTS);
    expect(model.calls.at(-1)!.messages.at(-1)!.content).toContain("PLUS SIMPLE");
  });

  it("demande une fois une tranche plus simple au lieu d'arrêter la leçon, et garde la ligne refusée au journal", async () => {
    // Banc Alloprof : la même faute revenait trois fois, la leçon s'arrêtait (sinus-cosinus, co2-ionique…).
    const bad = slice("s2", "o_s2", "trian");
    const model = scripted([header, slice("s1"), bad].join("\n"), bad, bad, [slice("s2"), slice("s3")].join("\n"));
    const logs: string[] = [];
    const events: NesalioEvent[] = [];
    for await (const event of generateNesalio("Explique-moi un point", {
      provider,
      completion: model.completion,
      log: (m, d) => logs.push(`${m} ${String(d)}`),
    }))
      events.push(event);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
    expect(model.calls).toHaveLength(2 + MAX_ATTEMPTS);
    expect(model.calls.at(-1)!.messages.at(-1)!.content).toContain("Dernier essai : réécris-la PLUS SIMPLE");
    expect(logs).toContainEqual(expect.stringMatching(/^nesalio: dernière chance, tranche demandée simplifiée s2/));
    expect(logs).toContainEqual(expect.stringMatching(/^nesalio: ligne refusée s2 — \{"slice":\{"slice_id":"s2"/));
  });

  it("redonne une chance à une tranche dont la correction apporte une nouvelle erreur", async () => {
    // Seen in real generations: the corrected tranche fixed its cue and aimed at an undeclared object instead.
    const model = scripted(
      [header, slice("s1"), slice("s2", "o_s2", "trian")].join("\n"),
      slice("s2", "o_s2").replace('"target":"o_s2"', '"target":"inconnu"'),
      [slice("s2"), slice("s3")].join("\n"),
    );
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
    expect(model.calls).toHaveLength(3);
  });

  it("refuse un geste que le lecteur ne sait pas jouer, même s’il est dans le contrat", async () => {
    const transform = JSON.stringify({
      slice: {
        slice_id: "s1",
        introduces: [
          { id: "a", type: "math", content: "x" },
          { id: "b", type: "math", content: "y" },
        ],
        beats: [
          { id: "b1", say: "On réorganise.", cues: [], do: [{ id: "r", verb: "layout.reflow", targets: ["a", "b"], intent: "aligner", at: "beat:start" }] },
        ],
      },
    });
    const model = scripted([header, transform].join("\n"), slice("s1"));
    const events = await run(model.completion);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "end"]);
    expect(model.calls[1]!.messages.at(-1)!.content).toContain("Capacité non exécutable « layout.reflow »");
  });

  it("signale une réponse sans tranche, une coupure du modèle et une explication jamais valide", async () => {
    expect(await run(scripted("Je ne sais pas.").completion)).toMatchObject([{ kind: "error", code: "empty" }]);
    const failing = () =>
      (async function* () {
        yield [header, slice("s1"), ""].join("\n");
        throw new Error("coupure");
      })();
    expect(kinds(await run(failing))).toEqual(["lesson", "slice:s1", "error"]);
    const neverValid = scripted([header, slice("s1", "o", "trian")].join("\n"), slice("s1", "o", "trian"), slice("s1", "o", "trian"));
    expect(await run(neverValid.completion)).toMatchObject([{ kind: "lesson" }, { kind: "error", code: "invalid" }]);
  });

  it("accepte une ligne à laquelle il ne manque que ses dernières accolades fermantes", async () => {
    // Seen in real generations: the header ends with `"expressions": {}}`, one `}` short.
    const model = scripted([header.slice(0, -1), slice("s1").slice(0, -2)].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
    expect(model.calls).toHaveLength(1);
  });

  it("lit deux objets JSON collés sur une même ligne", async () => {
    // Seen in real generations: « Unexpected non-whitespace character after JSON » — a tranche followed by the next one.
    const model = scripted([header, slice("s1") + slice("s2")].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
    expect(model.calls).toHaveLength(1);
  });

  it("ne complète pas une ligne coupée au milieu d’une valeur", async () => {
    expect(closeJsonLine('{"slice": {"at": [0, 1')).toBeUndefined();
    expect(closeJsonLine('{"say": "Voici')).toBeUndefined();
    expect(closeJsonLine('{"a": [1}')).toBeUndefined();
    expect(closeJsonLine('{"a": {"b": "}"}')).toBe('{"a": {"b": "}"}}');
  });

  it("redemande la ligne lesson quand l’en-tête manquait avant la tranche refusée", async () => {
    const model = scripted(['{"lesson": oups', slice("s1")].join("\n"), [header, slice("s1")].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
    expect(model.calls[1]!.messages.at(-1)!.content).toContain('ligne {"lesson"');
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
    const answers = [
      [header, slice("s1", "o1", "trian")].join("\n"),
      ...Array.from({ length: MAX_REPAIRS + 2 }, (_, i) => [slice(`s${i + 1}`, `o${i + 1}`), slice(`s${i + 2}`, `o${i + 2}`, "trian")].join("\n")),
    ];
    const model = scripted(...answers);
    const events = await run(model.completion);
    expect(model.calls).toHaveLength(MAX_REPAIRS + 2);
    expect(events.at(-1)).toMatchObject({ kind: "error", code: "incomplete" });
  });

  it("refuse un en-tête dont le contexte mathématique est faux et ne redemande que la ligne lesson", async () => {
    const badHeader = JSON.stringify({
      lesson: { id: "l", title: "Titre", language: "fr", learning_goal: "But" },
      math_context: { symbols: { a: { kind: "parameter", initial: 9, min: 0, max: 2 } }, expressions: {} },
    });
    const model = scripted([badHeader, slice("s1")].join("\n"), [header, slice("s1")].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
    const repair = model.calls[1]!.messages.at(-1)!.content;
    expect(repair).toContain('ligne {"lesson"');
    expect(repair).toContain("intervalle déclaré");
  });

  it("retire sans appel de l’en-tête une expression écrite en x", async () => {
    // Seen in real generations: the curve's formula put in math_context.expressions, where only symbols exist.
    const withCurve = JSON.stringify({
      lesson: { id: "l", title: "Titre", language: "fr", learning_goal: "But" },
      math_context: { symbols: {}, expressions: { f: "log(x)" } },
    });
    const model = scripted([withCurve, slice("s1")].join("\n"));
    const events = await run(model.completion);
    expect(kinds(events)).toEqual(["lesson", "slice:s1", "end"]);
    expect(events[0]).toMatchObject({ math_context: { expressions: {} } });
    expect(model.calls).toHaveLength(1);
  });

  it("demande une fois la suite quand le modèle s’arrête avant le nombre minimal de tranches", async () => {
    // Seen in real generations: the first tranche corrected, then nothing more.
    const model = scripted([header, slice("s1", "o1", "trian")].join("\n"), slice("s1", "o1"), [slice("s2", "o2"), slice("s3", "o3")].join("\n"));
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

  it("ne demande pas de suite à la leçon de refus hors périmètre, d’une seule tranche par consigne", async () => {
    const refusal = header.replace('"id":"l"', '"id":"hors_perimetre"');
    const model = scripted([refusal, slice("s_hors_perimetre", "o", "trian")].join("\n"), slice("s_hors_perimetre", "o"), "");
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s_hors_perimetre", "end"]);
    expect(model.calls).toHaveLength(2);
  });

  it("répare sans appel au modèle une faute de forme sûre, comme un repère nommé sans son préfixe", async () => {
    const unprefixed = slice("s1").replace('"cue:c"', '"cue:point"');
    const model = scripted([header, unprefixed].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
    expect(model.calls).toHaveLength(1);
  });

  it("répare sans appel un part visant une formule non découpée déclarée dans une tranche précédente", async () => {
    const formula = JSON.stringify({
      slice: {
        slice_id: "s1",
        introduces: [{ id: "eq", type: "math", content: "3x = 12" }],
        beats: [{ id: "b1", say: "Voici l'équation.", cues: [{ id: "c", text: "équation" }], do: [{ id: "w", verb: "write", target: "eq", at: "cue:c" }] }],
      },
    });
    const withPart = JSON.stringify({
      slice: {
        slice_id: "s2",
        introduces: [],
        beats: [
          {
            id: "b2",
            say: "Regarde le résultat.",
            cues: [{ id: "c", text: "résultat" }],
            do: [{ id: "h", verb: "highlight", target: "eq", part: "droite", role: "accent", at: "cue:c" }],
          },
        ],
      },
    });
    const model = scripted([header, formula, withPart].join("\n"));
    expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
    expect(model.calls).toHaveLength(1);
  });

  describe("en deux temps : l'enseignant écrit, le metteur en page met au format", () => {
    const script = "IDÉE CENTRALE : un point se repère par deux nombres.\nTRANCHE 1 — le point\nDIT : Voici un point.\nTABLEAU : un point en (0 ; 0).";

    it("donne au metteur en page le script de l'enseignant, mot pour mot, et au premier seulement la pédagogie", async () => {
      const model = scripted(script, [header, slice("s1")].join("\n"));
      const events: NesalioEvent[] = [];
      for await (const event of generateNesalio("Explique-moi un point", { provider, completion: model.completion, twoStage: true })) events.push(event);
      expect(kinds(events)).toEqual(["lesson", "slice:s1", "end"]);
      expect(model.calls).toHaveLength(2);
      const [teacher, layout] = model.calls as [CompletionOptions, CompletionOptions];
      // The teacher writes no syntax: the JSON format is not in its instructions.
      expect(teacher.messages[0]!.content).toContain("COMMENT TU ENSEIGNES");
      expect(teacher.messages[0]!.content).not.toContain("FORMAT DE SORTIE");
      expect(layout.messages[0]!.content).toContain("FORMAT DE SORTIE");
      expect(layout.messages.at(-1)!.content).toContain(script);
      expect(layout.messages.at(-1)!.content).toContain("MOT POUR MOT");
    });

    it("dit à l'élève que Nesa ne répond pas si l'enseignant n'écrit rien", async () => {
      const model = scripted("   ");
      const events: NesalioEvent[] = [];
      for await (const event of generateNesalio("Explique-moi un point", { provider, completion: model.completion, twoStage: true })) events.push(event);
      expect(events).toMatchObject([{ kind: "error", code: "upstream" }]);
      expect(model.calls).toHaveLength(1);
    });
  });

  describe("ligne illisible : jamais une tranche perdue en silence", () => {
    // Seen in real generations (base-zeros, base-portee, base-ohm-serie): a `]` missing in a tranche, the line
    // dropped, and the lesson announced as finished without it.
    const unreadable = (id: string) => slice(id).replace('}}],"beats"', '}},"beats"');

    it("renvoie au modèle une tranche illisible, avec l’erreur du lecteur JSON et le début et la fin de la ligne", async () => {
      expect(() => JSON.parse(unreadable("s2"))).toThrow();
      const model = scripted([header, slice("s1"), unreadable("s2"), slice("s3")].join("\n"), [slice("s2"), slice("s3")].join("\n"));
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(model.calls).toHaveLength(2);
      const repair = model.calls[1]!.messages.at(-1)!.content;
      expect(repair).toContain("« s2 » a été refusée");
      expect(repair).toContain("JSON");
      expect(repair).toContain(unreadable("s2").slice(0, 40));
      expect(repair).toContain(unreadable("s2").slice(-40));
    });

    it("annonce une leçon incomplète, jamais finie, quand la tranche reste illisible après ses corrections", async () => {
      const model = scripted([header, slice("s1"), unreadable("s2")].join("\n"), unreadable("s2"), unreadable("s2"));
      const events = await run(model.completion);
      expect(kinds(events)).toEqual(["lesson", "slice:s1", "error"]);
      expect(events.at(-1)).toMatchObject({ kind: "error", code: "incomplete" });
      expect(model.calls).toHaveLength(2 + MAX_ATTEMPTS);
    });

    it("ne joue pas la suite tant que la tranche refusée n’est pas rendue : il la redemande", async () => {
      // The correction skips s2: s3 is not played before it (the student would see s1 s3 s2), s2 is asked again.
      const model = scripted(
        [header, slice("s1"), unreadable("s2")].join("\n"),
        [slice("s3"), slice("s4")].join("\n"),
        [slice("s2"), slice("s3"), slice("s4")].join("\n"),
      );
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "slice:s4", "end"]);
      expect(model.calls).toHaveLength(3);
      expect(model.calls[2]!.messages.at(-1)!.content).toContain("réécris d'abord « s2 »");
      // Asked within the same limits: still skipped, the lesson is incomplete, never finished.
      const stubborn = scripted([header, slice("s1"), unreadable("s2")].join("\n"), [slice("s3"), slice("s4")].join("\n"), slice("s3"));
      const events = await run(stubborn.completion);
      expect(kinds(events)).toEqual(["lesson", "slice:s1", "error"]);
      expect(events.at(-1)).toMatchObject({ kind: "error", code: "incomplete" });
      expect(stubborn.calls).toHaveLength(2 + MAX_ATTEMPTS);
    });

    it("annonce une leçon incomplète quand une tranche lisible refusée n’est jamais rendue", async () => {
      const model = scripted([header, slice("s1"), slice("s2", "o_s2", "trian")].join("\n"), "");
      const events = await run(model.completion);
      expect(kinds(events)).toEqual(["lesson", "slice:s1", "error"]);
      expect(events.at(-1)).toMatchObject({ kind: "error", code: "incomplete" });
    });

    it("garde l’ordre quand la tranche refusée est suivie d’une valide sur la même ligne", async () => {
      // A1 (unreadable) and A2 (readable, refused): s3 was played before s2.
      for (const [s2, reason] of [
        [unreadable("s2"), "JSON illisible"],
        [slice("s2", "o_s2", "trian"), "mots entiers"],
      ] as const) {
        const model = scripted([header, slice("s1"), s2 + slice("s3")].join("\n"), [slice("s2"), slice("s3"), slice("s4")].join("\n"));
        expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "slice:s4", "end"]);
        expect(model.calls).toHaveLength(2);
        // The model is told why s2 was refused, not only that s3 came too early.
        expect(model.calls[1]!.messages.at(-1)!.content).toContain(reason);
      }
    });

    it("redemande le même identifiant quand la correction renomme la tranche, sans finir « incomplète » à tort", async () => {
      // B: s2 corrected as « s2bis »: asked again under its own id, then the whole lesson ends normally.
      const model = scripted(
        [header, slice("s1"), unreadable("s2")].join("\n"),
        [slice("s2bis"), slice("s3")].join("\n"),
        [slice("s2"), slice("s3")].join("\n"),
      );
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(model.calls[2]!.messages.at(-1)!.content).toContain("même slice_id");
    });

    it("saute une tranche déjà jouée que la correction réécrit de façon illisible", async () => {
      // G
      const model = scripted([header, slice("s1"), slice("s2", "o_s2", "trian")].join("\n"), [unreadable("s1"), slice("s2"), slice("s3")].join("\n"));
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(model.calls).toHaveLength(2);
    });

    it("ignore un en-tête réécrit illisible après son acceptation", async () => {
      // H
      const model = scripted(
        [header, slice("s1"), slice("s2", "o_s2", "trian")].join("\n"),
        [header.replace('"title"', ']"title"'), slice("s2"), slice("s3")].join("\n"),
      );
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(model.calls).toHaveLength(2);
    });

    it("renvoie une tranche illisible dont l’identifiant ne se lit pas, et prend la suivante pour sa correction", async () => {
      // F: a known limit — the next accepted tranche is taken as the correction, whatever its id.
      const anonymous = unreadable("s2").replace('"slice_id":"s2",', "");
      const model = scripted([header, slice("s1"), anonymous].join("\n"), [slice("s2"), slice("s3")].join("\n"));
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(model.calls[1]!.messages.at(-1)!.content).toContain("identifiant illisible");
    });

    it('ne coupe pas le flux pour une phrase qui cite "slice":, mais refuse une tranche étalée sur plusieurs lignes', async () => {
      // I
      const remark = 'Remarque : chaque ligne a la forme "slice": {...}';
      const model = scripted([header, slice("s1"), remark, slice("s2"), slice("s3")].join("\n"));
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(model.calls).toHaveLength(1);
      const spread = scripted([header, slice("s1"), "{", '"slice": {"slice_id": "s2",', "}"].join("\n"), [slice("s2"), slice("s3")].join("\n"));
      expect(kinds(await run(spread.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(spread.calls[1]!.messages.at(-1)!.content).toContain("UNE seule ligne");
    });

    it("recolle un en-tête et une tranche écrits sur plusieurs lignes (JSON indenté)", async () => {
      // Banc Alloprof (loi-hess, trois-pieces) : « { » seul puis "lesson": { … sur les lignes suivantes.
      const pretty = (line: string) => JSON.stringify(JSON.parse(line), null, 2).split("\n");
      const model = scripted([...pretty(header), ...pretty(slice("s1")), slice("s2")].join("\n"));
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
      expect(model.calls).toHaveLength(1);
      // With LaTeX written with one backslash (`\sqrt`), read with the same repairs as a one-line tranche (relecture du code).
      const latex = JSON.stringify(
        {
          slice: {
            slice_id: "s2",
            introduces: [{ id: "r", type: "math", content: "\\sqrt{2}" }],
            beats: [{ id: "b", say: "Voici racine de deux.", cues: [{ id: "c", text: "racine" }], do: [{ id: "w", verb: "write", target: "r", at: "cue:c" }] }],
          },
        },
        null,
        2,
      )
        .replace("\\\\sqrt", "\\sqrt")
        .split("\n");
      const withLatex = scripted([header, slice("s1"), ...latex].join("\n"));
      expect(kinds(await run(withLatex.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
      expect(withLatex.calls).toHaveLength(1);
    });

    it("lit sans appel une ligne JSON terminée par une virgule ou un crochet (sortie en tableau)", async () => {
      // C1 and C2
      for (const lines of [
        [header, `${slice("s1")},`, `${slice("s2")},`],
        [header, `[${slice("s1")},${slice("s2")}]`],
      ]) {
        const model = scripted(lines.join("\n"));
        expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
        expect(model.calls).toHaveLength(1);
      }
    });

    it("redemande un en-tête illisible avec l’erreur du lecteur JSON", async () => {
      const model = scripted([header.replace('"title"', ']"title"'), slice("s1")].join("\n"), [header, slice("s1")].join("\n"));
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
      const repair = model.calls[1]!.messages.at(-1)!.content;
      expect(repair).toContain('ligne {"lesson"');
      expect(repair).toContain('{"lesson":{"id":"l",]"title"');
    });

    it("lit une tranche précédée d’une phrase sur sa ligne", async () => {
      const model = scripted([header, `Voici la tranche : ${slice("s1")}`].join("\n"));
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
      expect(model.calls).toHaveLength(1);
    });

    it("lit sans appel une formule dont les commandes LaTeX n’ont qu’une barre oblique", async () => {
      const formula = (content: string) =>
        JSON.stringify({
          slice: {
            slice_id: "s1",
            introduces: [{ id: "eq", type: "math", content }],
            beats: [{ id: "b1", say: "Voici la formule.", cues: [{ id: "c", text: "formule" }], do: [{ id: "w", verb: "write", target: "eq", at: "cue:c" }] }],
          },
        }).replaceAll("\\\\", "\\");
      for (const content of [String.raw`x = 2 \pm \sqrt{3}`, String.raw`x = \frac{1}{2} \times 4`]) {
        const model = scripted([header, formula(content)].join("\n"));
        const events = await run(model.completion);
        expect(kinds(events)).toEqual(["lesson", "slice:s1", "end"]);
        expect(events[1]).toMatchObject({ slice: { introduces: [{ content }] } });
        expect(model.calls).toHaveLength(1);
      }
      // Both defects on one line: a lone `\sqrt` and the last closing braces missing.
      const both = scripted([header, formula(String.raw`x = 2 \pm \sqrt{3}`).slice(0, -2)].join("\n"));
      expect(kinds(await run(both.completion))).toEqual(["lesson", "slice:s1", "end"]);
      expect(both.calls).toHaveLength(1);
    });
  });

  describe("justesse (lot 2) : corrections, refus et alertes notées", () => {
    const formula = (id: string, content: string, verb = "write", declare = true) =>
      JSON.stringify({
        slice: {
          slice_id: id,
          introduces: declare ? [{ id: "eq", type: "math", content }] : [],
          beats: [{ id: `b_${id}`, say: "Voici le calcul.", cues: [{ id: "c", text: "calcul" }], do: [{ id: `w_${id}`, verb, target: "eq", at: "cue:c" }] }],
        },
      });

    it("joue la tranche corrigée par la validation et la rejoue ainsi au modèle", async () => {
      // « = » written for a rounding: the validation writes ≈; the model must see that version, not its own.
      const rounded = formula("s1", String.raw`\frac{1}{3} = 0{,}33`);
      const model = scripted([header, rounded, slice("s2", "o_s2", "trian")].join("\n"), [slice("s2"), slice("s3")].join("\n"));
      const events = await run(model.completion);
      expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(JSON.stringify(events[1])).toContain(String.raw`\\approx`);
      const replayed = model.calls[1]!.messages.at(-2)!.content;
      expect(replayed).toContain(String.raw`\\approx`);
      expect(replayed).not.toContain(rounded);
    });

    it("renvoie au modèle un refus de justesse avec la bonne valeur", async () => {
      const model = scripted([header, formula("s1", "2 + 2 = 5")].join("\n"), formula("s1", "2 + 2 = 4"));
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "end"]);
      const repair = model.calls[1]!.messages.at(-1)!.content;
      expect(repair).toContain("« s1 » a été refusée");
      expect(repair).toContain("vaut 4");
    });

    it("journalise une alerte notée sans bloquer la tranche", async () => {
      const logs: string[] = [];
      const model = scripted([header, formula("s1", "x = 4"), formula("s2", "x = 4", "write", false), slice("s3")].join("\n"));
      const events: NesalioEvent[] = [];
      for await (const event of generateNesalio("Explique", {
        provider,
        completion: model.completion,
        log: (message, detail) => logs.push(`${message} ${String(detail)}`),
      }))
        events.push(event);
      expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(logs).toContainEqual(expect.stringMatching(/^nesalio: alerte de justesse notée s2 — repeated_write/));
    });
  });

  describe("fiabilité de l’appel (cycle 2, lot 2)", () => {
    /** A model whose calls are scripted one by one: a text, an error thrown before any byte, or text then silence. */
    function calls(...steps: (string | Error | { thenSilent: string })[]) {
      const seen: CompletionOptions[] = [];
      const completion = (options: CompletionOptions) => {
        seen.push(options);
        const step = steps[seen.length - 1] ?? "";
        return (async function* () {
          if (step instanceof Error) throw step;
          const text = typeof step === "string" ? step : step.thenSilent;
          for (let i = 0; i < text.length; i += 7) yield text.slice(i, i + 7);
          if (typeof step !== "string") {
            // Silent until the call is aborted, as a hung connection.
            await new Promise((_, reject) => options.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
          }
        })();
      };
      return { completion, seen };
    }

    it("refait une fois l’appel qui échoue avant toute sortie, et livre la leçon complète", async () => {
      // Seen on the bench (diff-carres#2): « TypeError: fetch failed » after 10 s, no byte, the lesson lost.
      const model = calls(new TypeError("fetch failed"), [header, slice("s1"), slice("s2"), slice("s3")].join("\n"));
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(model.seen).toHaveLength(2);
      expect(model.seen[1]!.messages).toEqual(model.seen[0]!.messages);
    });

    it("ne refait l’appel qu’une fois, et pas pour une erreur que le même appel répéterait", async () => {
      const twice = calls(new TypeError("fetch failed"), new TypeError("fetch failed"), [header, slice("s1")].join("\n"));
      expect(await run(twice.completion)).toMatchObject([{ kind: "error", code: "upstream" }]);
      expect(twice.seen).toHaveLength(2);
      const refusedKey = calls(new UpstreamError("Le modèle a répondu 401", 401), [header, slice("s1")].join("\n"));
      expect(await run(refusedKey.completion)).toMatchObject([{ kind: "error", code: "upstream" }]);
      expect(refusedKey.seen).toHaveLength(1);
      // Cut after the first tranche: the student saw it, the call is not replayed.
      const cut = () =>
        (async function* () {
          yield [header, slice("s1"), ""].join("\n");
          throw new TypeError("fetch failed");
        })();
      expect(kinds(await run(cut))).toEqual(["lesson", "slice:s1", "error"]);
    });

    it("coupe un flux muet et reprend après la dernière tranche acceptée, dans le budget de corrections", async () => {
      const model = calls({ thenSilent: [header, slice("s1"), ""].join("\n") }, [slice("s2"), slice("s3")].join("\n"));
      const started = Date.now();
      expect(kinds(await run(model.completion, { idleTimeoutMs: 50 }))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(model.seen).toHaveLength(2);
      expect(model.seen[0]!.signal?.aborted).toBe(true);
      const resume = model.seen[1]!.messages;
      expect(resume.at(-2)).toMatchObject({ role: "assistant", content: [header, slice("s1")].join("\n") });
      expect(resume.at(-1)!.content).toContain("s'est arrêtée en route");
      expect(resume.at(-1)!.content).toContain("Tranches déjà acceptées : s1");
      // Always silent: stopped within the budget, never announced as finished.
      const mute = calls({ thenSilent: [header, slice("s1"), ""].join("\n") }, ...Array.from({ length: 6 }, () => ({ thenSilent: "" })));
      const events = await run(mute.completion, { idleTimeoutMs: 20 });
      expect(events.at(-1)).toMatchObject({ kind: "error", code: "incomplete" });
      expect(mute.seen.length).toBeLessThanOrEqual(2 + MAX_REPAIRS);
    });

    it("refait l’appel muet dès le départ, comme un appel qui échoue avant toute sortie", async () => {
      const model = calls({ thenSilent: "" }, [header, slice("s1")].join("\n"));
      expect(kinds(await run(model.completion, { idleTimeoutMs: 20 }))).toEqual(["lesson", "slice:s1", "end"]);
      expect(model.seen).toHaveLength(2);
    });

    it("attend plus longtemps le premier octet que le silence en cours de route (relecteur)", async () => {
      // Bench: healthy DeepSeek calls sent their header after up to 24.9 s; the 20 s idle limit would have cut them.
      const slowStart = () =>
        (async function* () {
          await new Promise((resolve) => setTimeout(resolve, 80));
          yield [header, slice("s1"), ""].join("\n");
        })();
      const events: NesalioEvent[] = [];
      for await (const event of generateNesalio("q", { provider, completion: slowStart, idleTimeoutMs: 20, firstByteTimeoutMs: 500 })) events.push(event);
      expect(kinds(events)).toEqual(["lesson", "slice:s1", "end"]);
    });
  });

  describe("JSON illisible du banc DeepSeek, lu par jsonrepair puis validé", () => {
    const withSay = (say: string) => slice("s1").replace('"say":"Voici un point."', `"say":"${say}"`);
    const lines: [string, string][] = [
      // interets#1: « Expected double-quoted property name » — a comma left before } or ].
      ["virgule avant }", slice("s1").replace('"at":"cue:c"}', '"at":"cue:c",}')],
      ["virgule avant ]", slice("s1").replace('"cue:c"}]}]', '"cue:c"},]},]')],
      // zeros#2: « Unexpected non-whitespace character after JSON » — the line ends with }}}}, one too many.
      ["accolade en trop à la fin", `${slice("s1")}}`],
      // radian-sens#1: « Expected ',' or '}' after property value » — a straight quote in a sentence.
      ["guillemet non échappé", withSay('Mets la calculatrice en mode "radians" : elle te donnera un point.')],
      ["guillemet suivi d’une virgule", withSay('En mode "radians", elle te donnera un point.')],
      ["guillemet suivi d’une lettre", withSay('Appuie sur "DRG" pour placer un point.')],
      // systeme-comparaison#1: « Expected ':' after property name » in cues.
      ["deux-points manquant", slice("s1").replace('"text":"point"', '"text" "point"')],
    ];

    for (const [name, line] of lines) {
      it(`lit sans appel une tranche : ${name}`, async () => {
        expect(() => JSON.parse(line)).toThrow();
        const model = scripted([header, line, slice("s2")].join("\n"));
        const events = await run(model.completion);
        expect(kinds(events)).toEqual(["lesson", "slice:s1", "slice:s2", "end"]);
        expect(model.calls).toHaveLength(1);
      });
    }

    it("garde le texte d’une phrase aux guillemets non échappés", async () => {
      const model = scripted([header, withSay('Mets la calculatrice en mode "radians" : elle te donnera un point.')].join("\n"));
      const events = await run(model.completion);
      expect(events[1]).toMatchObject({ slice: { beats: [{ say: 'Mets la calculatrice en mode "radians" : elle te donnera un point.' }] } });
    });

    it("ne complète pas une ligne coupée au milieu d’une phrase", async () => {
      const cut = slice("s2").slice(0, slice("s2").indexOf("un point") + 4);
      const model = scripted([header, slice("s1"), cut].join("\n"), [slice("s2"), slice("s3")].join("\n"));
      expect(kinds(await run(model.completion))).toEqual(["lesson", "slice:s1", "slice:s2", "slice:s3", "end"]);
      expect(model.calls).toHaveLength(2);
      expect(model.calls[1]!.messages.at(-1)!.content).toContain("Ligne JSON illisible");
      // The unreadable line is shown back as written.
      expect(model.calls[1]!.messages.at(-2)!.content.split("\n").at(-1)).toBe(cut);
    });
  });

  it("s’arrête au nombre maximal de tranches", async () => {
    const many = Array.from({ length: MAX_SLICES + 2 }, (_, i) => slice(`s${i}`));
    const events = await run(scripted([header, ...many].join("\n")).completion);
    expect(events.filter((event) => event.kind === "slice")).toHaveLength(MAX_SLICES);
    expect(events.at(-1)).toEqual({ kind: "end" });
  });
});
