import { describe, expect, it } from "vitest";
import type { Slice } from "@/domain/nesalio/contract";
import { lessonHeader } from "@/domain/nesalio/lesson";
import { FeedbackContextSchema } from "@/domain/feedback";
import { NesalioSession, type SessionDeps } from "./nesalioSession";
import type { NesalioFrame } from "./nesalioPlayback";

const header = lessonHeader({ id: "l", title: "Le sommet", language: "fr", learning_goal: "But" });
const slice = (id: string): Slice => ({
  slice_id: id, introduces: [],
  beats: [{ id: `b_${id}`, say: `Phrase de ${id}.`, cues: [], do: [] }],
});
const frame = { scene: { objects: new Map() } } as unknown as NesalioFrame;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A fake generator and player: the test decides when each passage plays and when the lesson ends. */
function fake(options: { open?: SessionDeps["open"]; failAfter?: number } = {}) {
  const calls = { open: 0, play: 0, reset: 0, drawn: 0, signals: [] as AbortSignal[] };
  const deps: SessionDeps = {
    open: options.open ?? (async () => {
      calls.open++;
      return { header, slices: (async function* () { yield slice("s1"); yield slice("s2"); })() };
    }),
    async play(_header, slices, play) {
      calls.play++;
      calls.signals.push(play.signal);
      let count = 0;
      for await (const s of slices) {
        play.signal.throwIfAborted();
        if (options.failAfter !== undefined && count >= options.failAfter) throw new Error("La voix a lâché.");
        play.onWaiting();
        play.onFrame(frame, s.beats[0]!);
        count++;
        await tick();
      }
    },
    board: { reset() { calls.reset++; }, draw() { calls.drawn++; } },
  };
  return { deps, calls };
}

describe("séance d'explication Nesalio (page élève)", () => {
  it("prépare, explique en sous-titrant chaque passage, puis termine", async () => {
    const { deps, calls } = fake();
    const session = new NesalioSession(deps);
    const statuses: string[] = [];
    session.subscribe(() => statuses.push(session.getSnapshot().status));
    await session.ask("Comment trouver le sommet ?");
    const snapshot = session.getSnapshot();
    expect(snapshot).toMatchObject({ status: "done", question: "Comment trouver le sommet ?", title: "Le sommet", caption: "Phrase de s2.", canReplay: true, error: null });
    expect(statuses[0]).toBe("preparing");
    expect(statuses).toContain("playing");
    expect(calls).toMatchObject({ open: 1, play: 1, drawn: 2 });
    expect(calls.reset).toBeGreaterThan(0);
  });

  it("revoit l'explication sans redemander au modèle", async () => {
    const { deps, calls } = fake();
    const session = new NesalioSession(deps);
    await session.ask("Q");
    await session.replay();
    expect(calls.open).toBe(1);
    expect(calls.play).toBe(2);
    expect(calls.drawn).toBe(4);
    expect(session.getSnapshot().status).toBe("done");
  });

  it("dit pourquoi l'explication n'a pas pu commencer, avec un message pour l'élève", async () => {
    const refused = new NesalioSession(fake({ open: async () => { throw new Error("Nesa n'arrive pas à répondre pour le moment."); } }).deps);
    await refused.ask("Q");
    expect(refused.getSnapshot()).toMatchObject({ status: "error", error: "Nesa n'arrive pas à répondre pour le moment.", canReplay: false });
    const offline = new NesalioSession(fake({ open: async () => { throw new TypeError("Failed to fetch"); } }).deps);
    await offline.ask("Q");
    expect(offline.getSnapshot().error).toMatch(/connexion/i);
  });

  it("garde au tableau ce qui a été expliqué quand la suite échoue, et le signale", async () => {
    const session = new NesalioSession(fake({ failAfter: 1 }).deps);
    await session.ask("Q");
    expect(session.getSnapshot()).toMatchObject({ status: "done", caption: "Phrase de s1.", canReplay: false });
    expect(session.getSnapshot().error).toMatch(/arrêtée/);
  });

  it("arrête l'explication en cours pour une nouvelle question, sans mélanger les deux", async () => {
    const { deps, calls } = fake();
    const session = new NesalioSession(deps);
    const first = session.ask("Première");
    await tick();
    const second = session.ask("Deuxième");
    await Promise.all([first, second]);
    expect(calls.signals[0]!.aborted).toBe(true);
    expect(session.getSnapshot()).toMatchObject({ status: "done", question: "Deuxième", error: null });
  });

  it("revient à l'accueil, tableau effacé, sur « Nouvelle notion »", async () => {
    const { deps, calls } = fake();
    const session = new NesalioSession(deps);
    const playing = session.ask("Q");
    await tick();
    const resets = calls.reset;
    session.stop();
    await playing;
    expect(calls.signals[0]!.aborted).toBe(true);
    expect(calls.reset).toBe(resets + 1);
    expect(session.getSnapshot()).toMatchObject({ status: "idle", question: null, caption: null });
  });

  it("se souvient de la dernière leçon terminée, même revenu à l'accueil (questionnaire d'après essai)", async () => {
    const session = new NesalioSession(fake().deps);
    expect(session.getSnapshot().lastFinished).toBeNull();
    await session.ask("Comment trouver le sommet ?");
    expect(session.getSnapshot().lastFinished).toBe("Comment trouver le sommet ?");
    await session.replay();
    session.stop();
    expect(session.getSnapshot()).toMatchObject({ status: "idle", question: null, lastFinished: "Comment trouver le sommet ?" });
  });

  it("ne compte pas comme terminée une leçon interrompue ou qui n'a pas pu commencer", async () => {
    const stopped = new NesalioSession(fake().deps);
    const playing = stopped.ask("Q");
    await tick();
    stopped.stop();
    await playing;
    expect(stopped.getSnapshot().lastFinished).toBeNull();
    const refused = new NesalioSession(fake({ open: async () => { throw new Error("Non."); } }).deps);
    await refused.ask("Q");
    expect(refused.getSnapshot().lastFinished).toBeNull();
  });

  it("met en pause et coupe le son par la commande donnée au lecteur", async () => {
    const session = new NesalioSession(fake().deps);
    session.setPaused(true);
    session.setMuted(true);
    expect(session.control).toMatchObject({ paused: true, muted: true });
    expect(session.getSnapshot()).toMatchObject({ paused: true, muted: true });
    // A new question always starts playing, even after a pause; the muted sound stays muted.
    await session.ask("Q");
    expect(session.getSnapshot()).toMatchObject({ paused: false, muted: true });
  });

  it("fournit le contexte d'un signalement dans le format attendu", async () => {
    const session = new NesalioSession(fake().deps);
    await session.ask("Q");
    const context = { ...session.recentContext(), screen: "1280×900", browser: "test" };
    expect(FeedbackContextSchema.safeParse(context).success).toBe(true);
    expect(context.recent).toEqual(["Phrase de s1.", "Phrase de s2."]);
  });
});
