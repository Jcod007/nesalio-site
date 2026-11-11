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
