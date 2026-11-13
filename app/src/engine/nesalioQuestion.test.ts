import { describe, expect, it } from "vitest";
import type { Slice } from "@/domain/nesalio/contract";
import { lessonHeader } from "@/domain/nesalio/lesson";
import { judge, type LessonQuestion } from "@/domain/nesalio/question";
import { NesalioSession, type SessionDeps } from "./nesalioSession";
import type { NesalioFrame } from "./nesalioPlayback";

const header = lessonHeader({ id: "l", title: "Réactif limitant", language: "fr", learning_goal: "But" });
const slice = (id: string): Slice => ({ slice_id: id, introduces: [], beats: [{ id: `b_${id}`, say: `Phrase de ${id}.`, cues: [], do: [] }] });
const frame = { scene: { objects: new Map() } } as unknown as NesalioFrame;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const question: LessonQuestion = {
  id: "q1",
  after: "s1",
  check: {
    prompt: "Avec 2 mol de N₂ et 3 mol de H₂, lequel s'épuise en premier ?",
    choices: ["N₂", "H₂"],
    answer: 1,
    ifRight: "Oui : 3 ÷ 3 = 1, c'est le plus petit.",
    ifWrong: "Pas tout à fait.",
    why: ["tu as comparé les quantités sans les diviser par les coefficients", ""],
  },
};

/** A player that calls afterSlice after each tranche, as the engine does. */
function session() {
  const played: string[] = [];
  const deps: SessionDeps = {
    open: async () => ({
      header,
      slices: (async function* () {
        yield slice("s1");
        yield slice("s2");
      })(),
      questions: new Map([["s1", question]]),
    }),
    async play(_header, slices, play) {
      for await (const s of slices) {
        play.onFrame(frame, s.beats[0]!);
        played.push(s.slice_id);
        await play.afterSlice(s.slice_id, play.signal);
      }
    },
    board: { reset() {}, draw() {} },
  };
  return { session: new NesalioSession(deps), played };
}

describe("questions à l'élève pendant une leçon", () => {
  it("arrête la leçon après la tranche, attend la réponse, puis continue", async () => {
    const { session: s, played } = session();
    const done = s.ask("C'est quoi le réactif limitant ?");
    await tick();
    await tick();
    expect(played).toEqual(["s1"]);
    expect(s.getSnapshot().asking).toMatchObject({ prompt: question.check.prompt, choices: ["N₂", "H₂"], solved: null });
    s.continueLesson(); // Not answered yet: nothing moves.
    await tick();
    expect(played).toEqual(["s1"]);
    s.answer(1);
    expect(s.getSnapshot().asking).toMatchObject({ solved: 1, right: true, feedback: "Oui : 3 ÷ 3 = 1, c'est le plus petit." });
    s.continueLesson();
    await done;
    expect(played).toEqual(["s1", "s2"]);
    expect(s.getSnapshot()).toMatchObject({ status: "done", asking: null });
  });

  it("nomme l'erreur d'un mauvais choix, laisse une seconde chance, puis montre la réponse", async () => {
    const { session: s } = session();
    void s.ask("Question");
    await tick();
    await tick();
    s.answer(0);
    expect(s.getSnapshot().asking).toMatchObject({
      wrong: [0],
      solved: null,
      right: false,
      feedback: "Pas tout à fait. Tu as comparé les quantités sans les diviser par les coefficients.",
    });
    s.answer(0); // Already tried: ignored.
    expect(s.getSnapshot().asking!.wrong).toEqual([0]);
    s.answer(1);
    expect(s.getSnapshot().asking).toMatchObject({ solved: 1, right: true });
    s.stop();
  });

  it("libère la lecture quand l'élève quitte pendant la question", async () => {
    const { session: s } = session();
    const done = s.ask("Question");
    await tick();
    await tick();
    s.stop();
    await done;
    expect(s.getSnapshot()).toMatchObject({ status: "idle", asking: null });
  });

  it("montre la bonne réponse après deux erreurs", () => {
    const three: LessonQuestion = { ...question, check: { ...question.check, choices: ["N₂", "H₂", "NH₃"], answer: 1, why: undefined } };
    expect(judge(three, 2)).toEqual({ right: false, say: "Pas tout à fait." });
    expect(judge(three, 1).right).toBe(true);
  });
});

// 2026-11-12, workshop feedback: a stop at the end of each tranche so the student can read, and going back to a passage.
describe("arrêt en fin de tranche et retour à un passage", () => {
  const two = (id: string): Slice => ({
    slice_id: id,
    introduces: [],
    beats: [1, 2].map((n) => ({ id: `${id}_b${n}`, say: `Phrase ${n} de ${id}.`, cues: [], do: [] })),
  });
  function lesson() {
    const played: string[] = [];
    const starts: number[] = [];
    const deps: SessionDeps = {
      open: async () => ({
        header,
        slices: (async function* () {
          yield two("s1");
          yield two("s2");
          yield two("s3");
        })(),
      }),
      async play(_header, slices, play) {
        starts.push(play.startAt);
        let index = 0;
        let previous: string | undefined;
        for await (const s of slices) {
          if (previous !== undefined && index > play.startAt) await play.afterSlice(previous, play.signal);
          for (const beat of s.beats) {
            if (index++ < play.startAt) continue;
            play.signal.throwIfAborted();
            play.onPassage(index - 1);
            play.onFrame(frame, beat);
            played.push(beat.id);
            await tick();
          }
          previous = s.slice_id;
        }
        if (previous !== undefined) await play.afterSlice(previous, play.signal);
      },
      board: { reset() {}, draw() {} },
    };
    return { session: new NesalioSession(deps), played, starts };
  }
  const settle = async () => {
    for (let i = 0; i < 8; i++) await tick();
  };

  it("ne s'arrête pas après l'ouverture, s'arrête après chaque tranche suivante jusqu'à « Continuer », pas après la dernière", async () => {
    const { session: s, played } = lesson();
    const done = s.ask("Q");
    await settle();
    expect(played).toEqual(["s1_b1", "s1_b2", "s2_b1", "s2_b2"]);
    expect(s.getSnapshot()).toMatchObject({ status: "playing", resting: true, asking: null, position: 3, steps: ["s1", "s1", "s2", "s2", "s3", "s3"] });
    s.continueLesson();
    await done;
    expect(played).toHaveLength(6);
    expect(s.getSnapshot()).toMatchObject({ status: "done", resting: false, position: 5, canReplay: true });
  });

  it("revient à un passage déjà entendu, pendant la leçon ou après, sans redemander au modèle", async () => {
    const { session: s, played, starts } = lesson();
    void s.ask("Q");
    await settle();
    const back = s.seek(1);
    expect(s.getSnapshot()).toMatchObject({ status: "playing", resting: false, position: 1, caption: "Phrase 2 de s1." });
    await settle();
    expect(starts).toEqual([0, 1]);
    expect(played.slice(4)).toEqual(["s1_b2", "s2_b1", "s2_b2"]);
    s.continueLesson();
    await back;
    expect(s.getSnapshot().status).toBe("done");
    void s.seek(9); // Not a passage of this lesson: nothing moves.
    expect(s.getSnapshot().status).toBe("done");
    const again = s.seek(4);
    await again;
    expect(starts).toEqual([0, 1, 4]);
    expect(played.slice(-2)).toEqual(["s3_b1", "s3_b2"]);
  });
});
