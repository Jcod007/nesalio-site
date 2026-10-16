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
});
