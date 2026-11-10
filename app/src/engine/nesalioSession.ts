/**
 * Séance d'explication Nesalio de la page élève : une question → la leçon
 * générée en flux et jouée au tableau, avec pause, son coupé, « Revoir
 * l'explication » (sans nouvel appel au modèle) et des messages d'erreur faits
 * pour l'élève. Au plus deux questions à choix pour vérifier la compréhension (question.ts) : la lecture
 * s'arrête après la tranche, l'élève répond, Nesa réagit ; pas de bilan.
 * La page affiche l'état (`getSnapshot`) ; le tableau et le réseau sont fournis.
 */
import type { Beat, Slice } from "@/domain/nesalio/contract";
import type { LessonHeader } from "@/domain/nesalio/lesson";
import { judge, type LessonQuestion } from "@/domain/nesalio/question";
import { createPlaybackControl, type PlaybackControl } from "./nesalioControl";
import type { NesalioFrame } from "./nesalioPlayback";

export type SessionStatus = "idle" | "preparing" | "playing" | "done" | "error";

/** A question on screen: the student picks a choice, Nesa reacts, then the lesson goes on. */
export interface AskingSnapshot {
  prompt: string;
  choices: readonly string[];
  /** Choices already tried and wrong: they cannot be picked again. */
  wrong: readonly number[];
  /** Once the student has the answer (right, or shown after a second miss): the right choice. */
  solved: number | null;
  /** What Nesa says about the last choice. */
  feedback: string | null;
  right: boolean | null;
}

/** Tries before the answer is shown: a second chance, then the solution. */
export const QUESTION_TRIES = 2;

export interface SessionSnapshot {
  status: SessionStatus;
  question: string | null;
  title: string | null;
  /** The sentence being said, shown in Nesa's card. */
  caption: string | null;
  /** The next tranche is still being written by the model. */
  waiting: boolean;
  paused: boolean;
  muted: boolean;
  /** For the student: why nothing could be explained, or why the explanation stopped early. */
  error: string | null;
  /** The whole lesson was received: it can be played again without asking the model. */
  canReplay: boolean;
  /**
   * The question of the last lesson that reached the end (even cut short), kept after
   * « Nouvelle notion »: the after-trial questions open when the student comes back home.
   */
  lastFinished: string | null;
  /** A question to the student, playback waiting for the answer. */
  asking: AskingSnapshot | null;
}

export interface SessionDeps {
  open(question: string, signal: AbortSignal): Promise<{ header: LessonHeader; slices: AsyncIterable<Slice>; questions?: Map<string, LessonQuestion> }>;
  play(header: LessonHeader, slices: AsyncIterable<Slice>, options: {
    signal: AbortSignal; control: PlaybackControl;
    onFrame(frame: NesalioFrame, beat: Beat): void;
    onWaiting(): void;
    afterSlice(sliceId: string, signal: AbortSignal): Promise<void>;
  }): Promise<void>;
  board: { reset(): void; draw(frame: NesalioFrame): void };
}

export const INITIAL_SESSION: SessionSnapshot = {
  status: "idle", question: null, title: null, caption: null, waiting: false, paused: false, muted: false, error: null, canReplay: false,
  lastFinished: null, asking: null,
};

const OFFLINE = "Je n'arrive pas à joindre Nesalio. Vérifie ta connexion, puis réessaie.";
const STOPPED = "L'explication s'est arrêtée en route. Tu peux réessayer ou poser une autre question.";
const FAILED = "Nesa n'a pas réussi à préparer l'explication. Réessaie, ou reformule ta question.";

function forStudent(error: unknown): string {
  // fetch fails with a TypeError when the network is down: its text is not for a student.
  if (error instanceof TypeError) return OFFLINE;
  return error instanceof Error && error.message ? error.message : FAILED;
}

export class NesalioSession {
  readonly control = createPlaybackControl();
  private snapshot: SessionSnapshot = INITIAL_SESSION;
  private readonly listeners = new Set<() => void>();
  private current?: AbortController;
  private recorded?: { header: LessonHeader; slices: Slice[]; complete: boolean; questions: Map<string, LessonQuestion> };
  private said: string[] = [];
  /** The question on screen and what releases playback once the student is done with it. */
  private pending?: { question: LessonQuestion; release(): void };

  constructor(private readonly deps: SessionDeps) {
    this.control.subscribe(() => this.set({ paused: this.control.paused, muted: this.control.muted }));
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly getSnapshot = () => this.snapshot;

  /** A new question: the board is cleared and the model writes a new lesson. */
  async ask(question: string): Promise<void> {
    const run = this.begin({ question: question.trim(), title: null });
    this.recorded = undefined;
    let header: LessonHeader;
    let slices: AsyncIterable<Slice>;
    let questions: Map<string, LessonQuestion>;
    try {
      let given: Map<string, LessonQuestion> | undefined;
      ({ header, slices, questions: given } = await this.deps.open(question.trim(), run.signal));
      questions = given ?? new Map();
    } catch (error) {
      if (!run.signal.aborted) this.set({ status: "error", error: forStudent(error) });
      return;
    }
    if (run.signal.aborted) return;
    const recorded = { header, slices: [] as Slice[], complete: false, questions };
    this.recorded = recorded;
    this.set({ title: header.lesson.title });
    const recording = (async function* () {
      for await (const slice of slices) {
        recorded.slices.push(slice);
        yield slice;
      }
      recorded.complete = true;
    })();
    await this.run(run, header, recording, questions);
  }

  /** The student picks a choice of the question on screen. */
  answer(choice: number): void {
    const asking = this.snapshot.asking;
    const pending = this.pending;
    if (!asking || !pending || asking.solved !== null || asking.wrong.includes(choice) || choice < 0 || choice >= asking.choices.length) return;
    const { right, say } = judge(pending.question, choice);
    if (right) {
      this.set({ asking: { ...asking, solved: choice, feedback: say, right: true } });
      return;
    }
    const wrong = [...asking.wrong, choice];
    // Second miss: the right answer is shown, with what this choice got wrong.
    const solved = wrong.length >= QUESTION_TRIES ? pending.question.check.answer! : null;
    const answer = solved === null ? "" : ` La bonne réponse : ${asking.choices[solved]}.`;
    this.set({ asking: { ...asking, wrong, solved, feedback: `${say}${answer}`, right: false } });
  }

  /** The student is done with the question: the lesson goes on. */
  continueLesson(): void {
    const pending = this.pending;
    if (!pending || this.snapshot.asking?.solved === null) return;
    this.pending = undefined;
    this.set({ asking: null });
    pending.release();
  }

  /** The same lesson again, from the start, without asking the model. */
  async replay(): Promise<void> {
    const recorded = this.recorded;
    if (!recorded?.complete) return;
    const run = this.begin({ question: this.snapshot.question, title: this.snapshot.title });
    await this.run(run, recorded.header, (async function* () { yield* recorded.slices; })(), recorded.questions);
  }

  /** Back to the start screen, board cleared. */
  stop(): void {
    this.releaseQuestion();
    this.current?.abort();
    this.current = undefined;
    this.recorded = undefined;
    this.said = [];
    this.control.setPaused(false);
    this.deps.board.reset();
    this.set({ ...INITIAL_SESSION, muted: this.control.muted, lastFinished: this.snapshot.lastFinished });
  }

  setPaused(paused: boolean): void { this.control.setPaused(paused); }

  setMuted(muted: boolean): void { this.control.setMuted(muted); }

  /** What the feedback form joins to a report (same format as the tutor's). */
  recentContext(): { question: string | null; title: string | null; status: string; recent: string[]; board: string[]; replay: string } {
    const { question, title, status } = this.snapshot;
    return { question: question?.slice(0, 500) ?? null, title: title?.slice(0, 120) ?? null, status,
      recent: this.said.slice(-6).map((line) => line.slice(0, 320)), board: [], replay: "" };
  }

  private releaseQuestion(): void {
    const pending = this.pending;
    this.pending = undefined;
    pending?.release();
  }

  private begin(identity: Pick<SessionSnapshot, "question" | "title">): AbortController {
    this.releaseQuestion();
    this.current?.abort();
    const run = new AbortController();
    this.current = run;
    this.said = [];
    this.control.setPaused(false);
    this.deps.board.reset();
    this.set({ ...INITIAL_SESSION, ...identity, status: "preparing", muted: this.control.muted, lastFinished: this.snapshot.lastFinished });
    return run;
  }

  private async run(run: AbortController, header: LessonHeader, slices: AsyncIterable<Slice>, questions: Map<string, LessonQuestion>): Promise<void> {
    let played = false;
    try {
      await this.deps.play(header, slices, {
        signal: run.signal,
        control: this.control,
        afterSlice: (sliceId, signal) => {
          const question = questions.get(sliceId);
          if (!question || this.current !== run || signal.aborted) return Promise.resolve();
          return new Promise<void>((resolve) => {
            const release = () => { signal.removeEventListener("abort", release); resolve(); };
            signal.addEventListener("abort", release, { once: true });
            this.pending = { question, release };
            this.set({ asking: { prompt: question.check.prompt, choices: question.check.choices, wrong: [], solved: null, feedback: null, right: null } });
          });
        },
        onWaiting: () => { if (this.current === run && played) this.set({ waiting: true }); },
        onFrame: (frame, beat) => {
          if (this.current !== run) return;
          this.deps.board.draw(frame);
          if (this.said.at(-1) !== beat.say) this.said.push(beat.say);
          played = true;
          if (this.snapshot.caption !== beat.say || this.snapshot.status !== "playing" || this.snapshot.waiting) {
            this.set({ status: "playing", caption: beat.say, waiting: false });
          }
        },
      });
      if (this.current !== run) return;
      this.set({ status: played ? "done" : "error", waiting: false, canReplay: Boolean(this.recorded?.complete),
        error: played ? null : FAILED, ...(played ? { lastFinished: this.snapshot.question } : {}) });
    } catch (error) {
      if (run.signal.aborted || this.current !== run) return;
      // What was explained stays on the board; the student is told the rest is missing.
      this.set(played
        ? { status: "done", waiting: false, canReplay: false, error: STOPPED, lastFinished: this.snapshot.question }
        : { status: "error", waiting: false, canReplay: false, error: forStudent(error) });
    }
  }

  private set(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}
