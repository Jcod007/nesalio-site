import { describe, expect, it } from "vitest";
import type { Step, StreamEvent } from "@/domain/scene/schema";
import type { TutorRequest } from "@/domain/tutor/request";
import { Player, type PlayerSnapshot } from "./player";
import type { Clock, Speaker, TutorSource } from "./ports";

/** Horloge instantanée : le temps avance mais personne n'attend vraiment. */
function fakeClock(): Clock {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
      await Promise.resolve();
    },
  };
}

/** Voix contrôlée par le test : chaque phrase reste « en cours » jusqu'à `finish()`. */
function fakeSpeaker() {
  const spoken: string[] = [];
  let pending: (() => void) | null = null;
  const speaker: Speaker = {
    estimate: () => 1000,
    speak(text) {
      spoken.push(text);
      return { done: new Promise<void>((resolve) => (pending = resolve)) };
    },
    cancel() {
      pending?.();
      pending = null;
    },
  };
  return {
    speaker,
    spoken,
    finish() {
      const p = pending;
      pending = null;
      p?.();
    },
  };
}

const step = (say: string, extra: Partial<Step> = {}): StreamEvent => ({ kind: "step", say, do: [], ...extra });

function scriptedSource(script: (request: TutorRequest) => StreamEvent[]) {
  const requests: TutorRequest[] = [];
  const source: TutorSource = {
    async *open(request) {
      requests.push(request);
      for (const event of script(request)) {
        await Promise.resolve();
        yield event;
      }
    },
  };
  return { source, requests };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function until(player: Player, predicate: (s: PlayerSnapshot) => boolean, guard = 200) {
  for (let i = 0; i < guard; i++) {
    if (predicate(player.getSnapshot())) return;
    await tick();
  }
  throw new Error(`Condition jamais atteinte, état : ${player.getSnapshot().status}`);
}

/** Termine les phrases au fur et à mesure jusqu'à la condition. */
async function speakUntil(player: Player, voice: ReturnType<typeof fakeSpeaker>, predicate: (s: PlayerSnapshot) => boolean) {
  for (let i = 0; i < 200; i++) {
    if (predicate(player.getSnapshot())) return;
    voice.finish();
    await tick();
  }
  throw new Error(`Condition jamais atteinte, état : ${player.getSnapshot().status}`);
}

describe("Player", () => {
  it("joue les étapes dans l'ordre, dessine, puis termine avec le résumé", async () => {
    const voice = fakeSpeaker();
    const { source } = scriptedSource(() => [
      { kind: "source", source: "model" },
      { kind: "lesson", title: "Pente" },
      step("Un.", { do: [{ type: "point", id: "A", at: [1, 1] }] }),
      step("Deux."),
      { kind: "end", summary: ["À retenir"] },
    ]);
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });

    player.ask("pente ?");
    expect(player.getSnapshot().status).toBe("thinking");
    await until(player, (s) => s.caption?.text === "Un.");
    expect(player.getSnapshot()).toMatchObject({ status: "playing", title: "Pente", source: "model" });
    expect(player.getSnapshot().board.order).toEqual(["A"]);

    await speakUntil(player, voice, (s) => s.status === "done");
    expect(voice.spoken).toEqual(["Un.", "Deux."]);
    expect(player.getSnapshot().summary).toEqual(["À retenir"]);
  });

  it("rend sa fiche de diagnostic au modèle au tour suivant, et montre ce qu'elle a remarqué à la fin", async () => {
    const voice = fakeSpeaker();
    const check = { prompt: "1/3 + 1/4 ?", choices: ["7/12", "2/7"], answer: 0 };
    const diagnosis = { gaps: [{ notion: "fractions", status: "suspected" as const }], strengths: ["calcule vite"], next: "vérifier les fractions" };
    const noticed = { strengths: ["Tu calcules vite."], toWork: ["Le dénominateur commun."] };
    const { source, requests } = scriptedSource((request) =>
      request.mode === "question"
        ? [step("On additionne.", { check }), { kind: "diagnosis", ...diagnosis }, { kind: "await" }]
        : [step("On répare."), { kind: "end", summary: ["À retenir"], noticed }],
    );
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });
    player.ask("fractions ?");
    await speakUntil(player, voice, (s) => s.status === "checking");
    player.answer(1);
    await until(player, () => requests.length === 2);
    expect(requests[1]!.context?.diagnosis).toEqual(diagnosis);
    await speakUntil(player, voice, (s) => s.status === "done");
    expect(player.getSnapshot().noticed).toEqual(noticed);
  });

  it("s'arrête quand on l'interrompt et redit la phrase coupée à la reprise", async () => {
    const voice = fakeSpeaker();
    const { source } = scriptedSource(() => [step("Un."), step("Deux."), { kind: "end", summary: [] }]);
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });

    player.ask("?");
    await until(player, (s) => s.caption?.text === "Un.");
    player.interrupt();
    await tick();
    expect(player.getSnapshot().status).toBe("paused");

    player.resume();
    await until(player, () => voice.spoken.length === 2);
    expect(voice.spoken).toEqual(["Un.", "Un."]);
    await speakUntil(player, voice, (s) => s.status === "done");
    expect(voice.spoken).toEqual(["Un.", "Un.", "Deux."]);
  });

  it("répond à une interruption avec le contexte, puis reprend la séance à l'étape suivante", async () => {
    const voice = fakeSpeaker();
    const { source, requests } = scriptedSource((request) =>
      request.mode === "question"
        ? [
            { kind: "lesson", title: "Zéros" },
            step("Un.", { do: [{ type: "curve", id: "f", fn: "x^2" }] }),
            step("Deux."),
            step("Trois."),
            { kind: "end", summary: [] },
          ]
        : [step("Je reformule."), { kind: "end", summary: [] }],
    );
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });

    player.ask("zéros ?");
    await until(player, (s) => s.caption?.text === "Un.");
    voice.finish();
    await until(player, (s) => s.caption?.text === "Deux.");
    player.interrupt();
    player.followUp("Pourquoi deux ?");

    await until(player, (s) => s.caption?.text === "Je reformule.");
    expect(player.getSnapshot().answeringFollowUp).toBe(true);
    const followUp = requests[1]!;
    expect(followUp.mode).toBe("followUp");
    expect(followUp.context).toMatchObject({ title: "Zéros", originalQuestion: "zéros ?", spoken: ["Un.", "Deux."], interrupted: true });
    expect(followUp.context?.board.map((b) => b.id)).toEqual(["f"]);

    await speakUntil(player, voice, (s) => s.status === "done");
    expect(voice.spoken).toEqual(["Un.", "Deux.", "Je reformule.", "Trois."]);
    expect(player.getSnapshot().board.order).toEqual(["f"]);
  });

  it("attend la réponse à une question de vérification et donne le bon retour", async () => {
    const voice = fakeSpeaker();
    const check = { prompt: "Combien ?", choices: ["0", "1"], answer: 0, ifRight: "Bravo !", ifWrong: "Presque." };
    const { source } = scriptedSource(() => [step("À toi.", { check }), { kind: "end", summary: [] }]);
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });

    player.ask("?");
    await speakUntil(player, voice, (s) => s.status === "checking");
    expect(player.getSnapshot().check).toMatchObject({ prompt: "Combien ?", picked: null });

    player.answer(1);
    await until(player, (s) => s.caption?.text === "Presque.");
    expect(player.getSnapshot()).toMatchObject({ check: { picked: 1 }, caption: { mood: "idee" } });
    await speakUntil(player, voice, (s) => s.status === "done");
  });

  it("cale la phrase sur la durée réelle de la voix et prépare la suivante", async () => {
    const voice = fakeSpeaker();
    const prefetched: string[] = [];
    const speaker: Speaker = { ...voice.speaker, prepare: async () => 4321, prefetch: (text) => prefetched.push(text) };
    const { source } = scriptedSource(() => [step("Un."), step("Deux."), { kind: "end", summary: [] }]);
    const player = new Player({ speaker, source, clock: fakeClock() });
    player.ask("?");
    await until(player, (s) => s.caption?.text === "Un.");
    expect(player.getSnapshot().caption?.durationMs).toBe(4321);
    await until(player, () => prefetched.includes("Deux."));
    await speakUntil(player, voice, (s) => s.status === "done");
  });

  it("cale les repères sur la partie vraiment parlée de l'audio, sans ses silences", async () => {
    const voice = fakeSpeaker();
    const speaker: Speaker = {
      ...voice.speaker,
      prepare: async () => 4000,
      speechSpan: () => ({ startMs: 500, endMs: 3500 }),
    };
    const { source } = scriptedSource(() => [
      step("Voici le point.", { cues: { A: 1 }, do: [{ type: "point", id: "A", at: [1, 1] }] }),
      { kind: "end", summary: [] },
    ]);
    const player = new Player({ speaker, source, clock: fakeClock() });
    player.ask("?");
    await until(player, (s) => s.caption?.text === "Voici le point.");
    const snapshot = player.getSnapshot();
    const offset = snapshot.board.nodes.A!.reveal.start - snapshot.caption!.startedAt;
    // Fin de la voix (3 500 ms) moins l'avance de 150 ms, et non la fin du fichier (4 000 ms).
    expect(offset).toBe(3350);
    await speakUntil(player, voice, (s) => s.status === "done");
  });

  it("affiche une erreur si la première réponse échoue", async () => {
    const voice = fakeSpeaker();
    const { source } = scriptedSource(() => [{ kind: "error", code: "upstream", message: "Indisponible" }]);
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });
    player.ask("?");
    await until(player, (s) => s.status === "error");
    expect(player.getSnapshot().error).toBe("Indisponible");
  });

  it("une nouvelle question remplace la séance en cours et vide le tableau", async () => {
    const voice = fakeSpeaker();
    const { source } = scriptedSource((r) => [
      step(r.question, { do: [{ type: "point", id: r.question, at: [0, 0] }] }),
      { kind: "end", summary: [] },
    ]);
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });
    player.ask("a");
    await until(player, (s) => s.caption?.text === "a");
    player.ask("b");
    await until(player, (s) => s.caption?.text === "b");
    expect(player.getSnapshot().board.order).toEqual(["b"]);
    await speakUntil(player, voice, (s) => s.status === "done");
    expect(voice.spoken).toEqual(["a", "b"]);
  });

  it("avance par tours : la réponse de l'élève déclenche le tour suivant, avec sa réponse", async () => {
    const voice = fakeSpeaker();
    const check = { prompt: "Combien ?", choices: ["0", "2"], answer: 1, ifRight: "Oui !", ifWrong: "Presque." };
    const { source, requests } = scriptedSource((request) =>
      request.mode === "question"
        ? [{ kind: "lesson", title: "Zéros" }, step("Devine.", { check }), { kind: "await" }]
        : [step("Tu avais choisi 0 : regardons le sommet."), { kind: "end", summary: ["Sommet"] }],
    );
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });

    player.ask("zéros ?");
    await speakUntil(player, voice, (s) => s.status === "checking");
    player.answer(0);
    await until(player, () => requests.length === 2);
    const next = requests[1]!;
    expect(next.mode).toBe("continue");
    expect(next.answer).toEqual({ prompt: "Combien ?", choices: ["0", "2"], picked: "0", correct: false });
    expect(next.context?.spoken).toContain("Combien ?");
    expect(next.context?.answered).toBe(1);

    await speakUntil(player, voice, (s) => s.status === "done");
    // La question est dite à voix haute (la phrase de l'étape ne la posait pas).
    expect(voice.spoken).toEqual(["Devine.", "Combien ?", "Presque.", "Tu avais choisi 0 : regardons le sommet."]);
    expect(player.getSnapshot().summary).toEqual(["Sommet"]);
  });

  it("garde la mémoire de la séance : objectifs, réponses passées, erreur visée, relecture du tour", async () => {
    const voice = fakeSpeaker();
    const check1 = { prompt: "Combien ?", choices: ["0", "2"], answer: 1, why: ["confond sommet et zéro", ""] };
    const check2 = { prompt: "Et la moyenne ?", choices: ["0", "1"], answer: 0, why: ["", "croit que tout s'additionne"] };
    const { source, requests } = scriptedSource((request) => {
      if (request.mode === "question") {
        return [{ kind: "lesson", title: "Zéros", goals: ["Lire le sommet", "Trouver les zéros"] }, step("Devine.", { check: check1 }), { kind: "await" }];
      }
      if (request.context?.answered === 1) {
        return [step("Les bosses s'annulent."), step("Donc la moyenne est nulle."), step("À toi.", { check: check2 }), { kind: "await" }];
      }
      return [step("Bravo."), { kind: "end", summary: [] }];
    });
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });

    player.ask("zéros ?");
    await speakUntil(player, voice, (s) => s.status === "checking");
    player.answer(0);
    await until(player, () => requests.length === 2);
    expect(requests[1]!.answer?.misconception).toBe("confond sommet et zéro");
    expect(requests[1]!.context?.goals).toEqual(["Lire le sommet", "Trouver les zéros"]);

    await speakUntil(player, voice, (s) => s.status === "checking" && s.check?.prompt === "Et la moyenne ?");
    player.answer(1);
    await until(player, () => requests.length === 3);
    const third = requests[2]!.context!;
    expect(third.answers).toEqual([{ prompt: "Combien ?", picked: "0", correct: false, misconception: "confond sommet et zéro" }]);
    expect(third.review?.some((r) => r.includes("sans le montrer"))).toBe(true);
    expect(requests[2]!.answer?.misconception).toBe("croit que tout s'additionne");
  });

  it("n'écrit pas une ligne de calcul que la figure contredit, et la rend au modèle pour qu'il se corrige", async () => {
    const voice = fakeSpeaker();
    const figure: Step["do"] = [
      { type: "triangle", id: "tri", points: [[0, 0], [4, 0], [2, 4]], names: ["A", "B", "C"] },
      { type: "point", id: "D", at: [1, 2], label: "D" },
      { type: "point", id: "p2", at: [3, 2], label: "E" },
      { type: "note", id: "juste", text: "$\\frac{CD}{CA} = \\frac{CE}{CB}$" },
      { type: "note", id: "faux", text: "$\\frac{AE}{AB} = \\frac{CD}{CA}$" },
    ];
    const check = { prompt: "Pourquoi ?", choices: ["a", "b"], answer: 0 };
    const { source, requests } = scriptedSource((request) =>
      request.mode === "question"
        ? [{ kind: "lesson", title: "Thalès" }, step("Thalès dit que AD/AC = AE/AB.", { do: figure }), step("À toi.", { check }), { kind: "await" }]
        : [step("Je me corrige."), { kind: "end", summary: [] }],
    );
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });

    player.ask("Démontre-moi le théorème de Thalès");
    await speakUntil(player, voice, (s) => s.status === "checking");
    const board = player.getSnapshot().board;
    expect(board.nodes["juste"]).toBeDefined();
    expect(board.nodes["faux"]).toBeUndefined();
    player.answer(0);
    await until(player, () => requests.length === 2);
    const review = requests[1]!.context?.review ?? [];
    expect(review[0]).toMatch(/Affirmation fausse.*AD\/AC = AE\/AB/);
    expect(review.some((r) => r.includes("AE/AB = CD/CA"))).toBe(true);
  });

  it("garde l'enregistrement exact de la séance, pour qu'un signalement puisse être rejoué", async () => {
    const voice = fakeSpeaker();
    const { source } = scriptedSource(() => [{ kind: "lesson", title: "Zéros" }, step("Voici la parabole."), { kind: "end", summary: [] }]);
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });
    player.ask("zéros ?");
    await speakUntil(player, voice, (s) => s.status === "done");
    const context = player.recentContext();
    const turns = JSON.parse(context.replay) as Array<Array<{ kind: string; say?: string }>>;
    expect(turns).toHaveLength(1);
    expect(turns[0]!.map((e) => e.kind)).toEqual(["lesson", "step", "end"]);
    expect(context.recent).toContain("Voici la parabole.");
  });

  it("une question pour situer l'élève n'a pas de verdict", async () => {
    const voice = fakeSpeaker();
    const check = { prompt: "Tu connais le triangle rectangle ?", choices: ["Oui", "Un peu", "Non"] };
    const { source, requests } = scriptedSource((request) =>
      request.mode === "question"
        ? [step("Avant de commencer.", { check }), { kind: "await" }]
        : [step("On part de la base."), { kind: "end", summary: [] }],
    );
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });

    player.ask("trigo ?");
    await speakUntil(player, voice, (s) => s.status === "checking");
    player.answer(2);
    await speakUntil(player, voice, (s) => s.status === "done");
    expect(requests[1]?.answer).toMatchObject({ picked: "Non", correct: null });
    expect(voice.spoken).toEqual(["Avant de commencer.", "Tu connais le triangle rectangle ?", "On part de la base."]);
  });

  it("ne repose pas une question déjà répondue après une interruption", async () => {
    const voice = fakeSpeaker();
    const check = { prompt: "Combien ?", choices: ["0", "2"], answer: 1, ifRight: "Oui !", ifWrong: "Presque." };
    const { source } = scriptedSource((request) =>
      request.mode === "question"
        ? [step("Devine.", { check }), { kind: "await" }]
        : [step("Suite."), { kind: "end", summary: [] }],
    );
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });

    player.ask("?");
    await speakUntil(player, voice, (s) => s.status === "checking");
    player.answer(1);
    await until(player, (s) => s.caption?.text === "Oui !");
    player.interrupt();
    player.resume();
    await speakUntil(player, voice, (s) => s.status === "done");
    expect(voice.spoken).toEqual(["Devine.", "Combien ?", "Oui !", "Suite."]);
  });

  it("ne dessine qu'une fois la voix vraiment lancée", async () => {
    let start: () => void = () => {};
    const voice = fakeSpeaker();
    const speaker: Speaker = {
      ...voice.speaker,
      speak(text) {
        const handle = voice.speaker.speak(text);
        return { ...handle, started: new Promise<void>((resolve) => (start = resolve)) };
      },
    };
    const { source } = scriptedSource(() => [step("Voici A.", { do: [{ type: "point", id: "A", at: [1, 1] }] }), { kind: "end", summary: [] }]);
    // Horloge où l'attente de sécurité (4 s) ne se termine jamais d'elle-même.
    const base = fakeClock();
    const clock: Clock = { now: base.now, sleep: (ms, signal) => (ms >= 4000 ? new Promise(() => signal?.aborted) : base.sleep(ms, signal)) };
    const player = new Player({ speaker, source, clock });

    player.ask("?");
    await until(player, () => voice.spoken.length === 1);
    await tick();
    expect(player.getSnapshot().board.order).toEqual([]);
    start();
    await until(player, (s) => s.board.order.includes("A"));
    await speakUntil(player, voice, (s) => s.status === "done");
  });

  it("accepte une réponse dite : un choix reconnu, sinon une réponse libre que Nesa évaluera", async () => {
    const voice = fakeSpeaker();
    const check = { prompt: "Combien de zéros ?", choices: ["0", "1", "2"], answer: 2, ifRight: "Oui !", ifWrong: "Presque." };
    const { source, requests } = scriptedSource((request) =>
      request.mode === "question" ? [step("Combien de zéros a-t-elle ?", { check }), { kind: "await" }] : [step("Suite."), { kind: "end", summary: [] }],
    );
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });
    player.ask("?");
    await speakUntil(player, voice, (s) => s.status === "checking");
    // La phrase posait déjà la question : elle n'est pas répétée.
    expect(voice.spoken).toEqual(["Combien de zéros a-t-elle ?"]);
    player.answerText("je pense 2");
    await until(player, () => requests.length === 2);
    expect(requests[1]!.answer).toMatchObject({ picked: "2", correct: true });
    await speakUntil(player, voice, (s) => s.status === "done");
  });

  it("transmet une réponse libre telle quelle, sans verdict immédiat", async () => {
    const voice = fakeSpeaker();
    const check = { prompt: "Pourquoi ?", choices: ["parce que a", "parce que b"], answer: 0 };
    const { source, requests } = scriptedSource((request) =>
      request.mode === "question" ? [step("Pourquoi ?", { check }), { kind: "await" }] : [step("Voyons ta réponse."), { kind: "end", summary: [] }],
    );
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });
    player.ask("?");
    await speakUntil(player, voice, (s) => s.status === "checking");
    player.answerText("Parce que la courbe descend des deux côtés");
    await until(player, () => requests.length === 2);
    expect(requests[1]!.answer).toMatchObject({ picked: "Parce que la courbe descend des deux côtés", correct: null });
    await speakUntil(player, voice, (s) => s.status === "done");
  });

  it("garde une réponse dite à voix haute en entier, même longue (un raisonnement complet)", async () => {
    const voice = fakeSpeaker();
    const check = { prompt: "Que vaut l'hypoténuse ?", choices: ["7", "5", "25"], answer: 1 };
    const { source, requests } = scriptedSource((request) =>
      request.mode === "question" ? [step("Calcule.", { check }), { kind: "await" }] : [step("Voyons."), { kind: "end", summary: [] }],
    );
    const player = new Player({ speaker: voice.speaker, source, clock: fakeClock() });
    player.ask("?");
    await speakUntil(player, voice, (s) => s.status === "checking");
    const reasoning =
      "On va faire 3 au carré, ça fait 3 fois 3, ça fait 9, plus 4 au carré, ça fait 4 fois 4, ça fait 16, on va faire 9 plus 16, ça fait 25, on va prendre la racine de 25 et ça donne 5";
    player.answerText(reasoning);
    await until(player, () => requests.length === 2);
    expect(requests[1]!.answer!.picked).toBe(reasoning);
    await speakUntil(player, voice, (s) => s.status === "done");
  });
});
