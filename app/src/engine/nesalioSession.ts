/**
 * Séance d'explication Nesalio de la page élève : une question → la leçon
 * générée en flux et jouée au tableau, avec pause, son coupé, « Revoir
 * l'explication » (sans nouvel appel au modèle) et des messages d'erreur faits
 * pour l'élève. L'élève peut revenir à un passage déjà entendu (`seek`) : le tableau est remis dans l'état de ce
 * moment et la voix repart de là. À la fin de chaque tranche la lecture s'arrête, tableau affiché, jusqu'à
 * « Continuer » (retours d'atelier du 2026-11-12). Au plus deux questions à choix pour vérifier la compréhension (question.ts) : la lecture
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
  /** The passages received so far, in order: for each, the tranche it belongs to. What the student can go back to. */
  steps: readonly string[];
  /** Rank in `steps` of the passage being played (the last one played, once the lesson is over). */
  position: number | null;
  /** A tranche is over and stays on the board: playback waits for « Continuer », so the student can read. */
  resting: boolean;
}

export interface SessionDeps {
  open(question: string, signal: AbortSignal): Promise<{ header: LessonHeader; slices: AsyncIterable<Slice>; questions?: Map<string, LessonQuestion> }>;
  play(
    header: LessonHeader,
    slices: AsyncIterable<Slice>,
    options: {
      signal: AbortSignal;
      control: PlaybackControl;
      onFrame(frame: NesalioFrame, beat: Beat): void;
      onWaiting(): void;
      afterSlice(sliceId: string, signal: AbortSignal): Promise<void>;
      /** Passage to start from; the ones before it are applied to the board without being played. */
      startAt: number;
      onPassage(index: number): void;
    },
  ): Promise<void>;
  board: { reset(): void; draw(frame: NesalioFrame): void };
}

export const INITIAL_SESSION: SessionSnapshot = {
  status: "idle",
  question: null,
  title: null,
  caption: null,
  waiting: false,
  paused: false,
  muted: false,
  error: null,
  canReplay: false,
  lastFinished: null,
  asking: null,
  steps: [],
  position: null,
  resting: false,
};

/** A lesson as received: read from the network once, whatever is played and replayed from it. */
interface Lesson {
  header: LessonHeader;
  slices: Slice[];
  questions: Map<string, LessonQuestion>;
  /** The whole lesson was received. */
  complete: boolean;
  /** The stream broke: what was received can still be played, then this is thrown. */
  failure?: { error: unknown };
  /** Stops the network stream (new question, back to the start screen). */
  stop: AbortController;
  wake: Set<() => void>;
}

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
  private lesson?: Lesson;
  private said: string[] = [];
  /** What releases playback once the student is done with the question on screen, or has read the tranche. */
  private pending?: { question?: LessonQuestion; release(): void };

  constructor(private readonly deps: SessionDeps) {
    this.control.subscribe(() => this.set({ paused: this.control.paused, muted: this.control.muted }));
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = () => this.snapshot;

  /** A new question: the board is cleared and the model writes a new lesson. */
  async ask(question: string): Promise<void> {
    this.lesson?.stop.abort();
    this.lesson = undefined;
    const run = this.begin({ question: question.trim(), title: null });
    const stop = new AbortController();
    // Until the lesson is opened, leaving stops the request; afterwards the lesson outlives each playback run.
    run.signal.addEventListener(
      "abort",
      () => {
        if (this.lesson?.stop !== stop) stop.abort();
      },
      { once: true },
    );
    let header: LessonHeader;
    let slices: AsyncIterable<Slice>;
    let questions: Map<string, LessonQuestion>;
    try {
      let given: Map<string, LessonQuestion> | undefined;
      ({ header, slices, questions: given } = await this.deps.open(question.trim(), stop.signal));
      questions = given ?? new Map();
    } catch (error) {
      if (!run.signal.aborted) this.set({ status: "error", error: forStudent(error) });
      return;
    }
    if (run.signal.aborted) return;
    const lesson: Lesson = { header, slices: [], questions, complete: false, stop, wake: new Set() };
    this.lesson = lesson;
    this.set({ title: header.lesson.title });
    void this.receive(lesson, slices);
    await this.run(run, lesson, 0);
  }

  /** Reads the lesson from the network, whatever playback does meanwhile (the student may go back before it ends). */
  private async receive(lesson: Lesson, slices: AsyncIterable<Slice>): Promise<void> {
    try {
      for await (const slice of slices) {
        if (lesson.stop.signal.aborted) break;
        lesson.slices.push(slice);
        if (this.lesson === lesson) this.set({ steps: lesson.slices.flatMap((s) => s.beats.map(() => s.slice_id)) });
        this.wake(lesson);
      }
      if (!lesson.stop.signal.aborted) lesson.complete = true;
    } catch (error) {
      lesson.failure = { error };
    } finally {
      this.wake(lesson);
    }
  }

  private wake(lesson: Lesson): void {
    const waiting = [...lesson.wake];
    lesson.wake.clear();
    for (const resume of waiting) resume();
  }

  /** The lesson's tranches from the first one: those received, then the others as they come. */
  private async *tranches(lesson: Lesson, signal: AbortSignal): AsyncGenerator<Slice> {
    for (let index = 0; ; ) {
      while (index < lesson.slices.length) yield lesson.slices[index++]!;
      if (lesson.failure) throw lesson.failure.error;
      if (lesson.complete || signal.aborted) return;
      await new Promise<void>((resolve) => {
        lesson.wake.add(resolve);
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    }
  }

  /** The student picks a choice of the question on screen. */
  answer(choice: number): void {
    const asking = this.snapshot.asking;
    const pending = this.pending;
    if (!asking || !pending?.question || asking.solved !== null || asking.wrong.includes(choice) || choice < 0 || choice >= asking.choices.length) return;
    const question = pending.question;
    const { right, say } = judge(question, choice);
    if (right) {
      this.set({ asking: { ...asking, solved: choice, feedback: say, right: true } });
      return;
    }
    const wrong = [...asking.wrong, choice];
    // Second miss: the right answer is shown, with what this choice got wrong.
    const solved = wrong.length >= QUESTION_TRIES ? question.check.answer! : null;
    const answer = solved === null ? "" : ` La bonne réponse : ${asking.choices[solved]}.`;
    this.set({ asking: { ...asking, wrong, solved, feedback: `${say}${answer}`, right: false } });
  }

  /** The student is done with the question, or has read the tranche: the lesson goes on. */
  continueLesson(): void {
    const pending = this.pending;
    if (!pending || this.snapshot.asking?.solved === null) return;
    this.pending = undefined;
    this.set({ asking: null, resting: false });
    pending.release();
  }

  /** The same lesson again, from the start, without asking the model. */
  async replay(): Promise<void> {
    if (!this.lesson?.complete) return;
    await this.seek(0);
  }

  /**
   * Back (or forward) to a passage already received: the board is put as it stood when that passage began and the
   * voice starts again from there, without asking the model. Passages not received yet cannot be reached.
   */
  async seek(index: number): Promise<void> {
    const lesson = this.lesson;
    const { steps, status, question, title } = this.snapshot;
    if (!lesson || !Number.isInteger(index) || index < 0 || index >= steps.length || (status !== "playing" && status !== "done")) return;
    const caption = lesson.slices.flatMap((slice) => slice.beats)[index]?.say ?? null;
    const run = this.begin({ question, title }, { status: "playing", steps, position: index, caption });
    await this.run(run, lesson, index);
  }

  /** Back to the start screen, board cleared. */
  stop(): void {
    this.releaseQuestion();
    this.current?.abort();
    this.current = undefined;
    this.lesson?.stop.abort();
    this.lesson = undefined;
    this.said = [];
    this.control.setPaused(false);
    this.deps.board.reset();
    this.set({ ...INITIAL_SESSION, muted: this.control.muted, lastFinished: this.snapshot.lastFinished });
  }

  setPaused(paused: boolean): void {
    this.control.setPaused(paused);
  }

  setMuted(muted: boolean): void {
    this.control.setMuted(muted);
  }

  /** What the feedback form joins to a report (same format as the tutor's). */
  recentContext(): { question: string | null; title: string | null; status: string; recent: string[]; board: string[]; replay: string } {
    const { question, title, status } = this.snapshot;
    return {
      question: question?.slice(0, 500) ?? null,
      title: title?.slice(0, 120) ?? null,
      status,
      recent: this.said.slice(-6).map((line) => line.slice(0, 320)),
      board: [],
      replay: "",
    };
  }

  private releaseQuestion(): void {
    const pending = this.pending;
    this.pending = undefined;
    pending?.release();
  }

  private begin(identity: Pick<SessionSnapshot, "question" | "title">, kept: Partial<SessionSnapshot> = {}): AbortController {
    this.releaseQuestion();
    this.current?.abort();
    const run = new AbortController();
    this.current = run;
    this.said = [];
    this.control.setPaused(false);
    this.deps.board.reset();
    this.set({ ...INITIAL_SESSION, ...identity, status: "preparing", muted: this.control.muted, lastFinished: this.snapshot.lastFinished, ...kept });
    return run;
  }

  private async run(run: AbortController, lesson: Lesson, startAt: number): Promise<void> {
    // Back on a passage already heard: the lesson has been played, whatever happens next.
    let played = this.snapshot.status === "playing";
    try {
      await this.deps.play(lesson.header, this.tranches(lesson, run.signal), {
        signal: run.signal,
        control: this.control,
        startAt,
        onPassage: (index) => {
          if (this.current === run && this.snapshot.position !== index) this.set({ position: index });
        },
        afterSlice: (sliceId, signal) => {
          if (this.current !== run || signal.aborted) return Promise.resolve();
          const question = lesson.questions.get(sliceId);
          // Nothing to read after the opening; after the last tranche the lesson is simply over.
          const opening = lesson.slices[0]?.slice_id === sliceId;
          const last = lesson.complete && lesson.slices.at(-1)?.slice_id === sliceId;
          if (!question && (opening || last)) return Promise.resolve();
          return new Promise<void>((resolve) => {
            const release = () => {
              signal.removeEventListener("abort", release);
              resolve();
            };
            signal.addEventListener("abort", release, { once: true });
            this.pending = { question, release };
            this.set(
              question
                ? { asking: { prompt: question.check.prompt, choices: question.check.choices, wrong: [], solved: null, feedback: null, right: null } }
                : { resting: true },
            );
          });
        },
        onWaiting: () => {
          if (this.current === run && played) this.set({ waiting: true });
        },
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
      this.set({
        status: played ? "done" : "error",
        waiting: false,
        canReplay: lesson.complete,
        error: played ? null : FAILED,
        ...(played ? { lastFinished: this.snapshot.question } : {}),
      });
    } catch (error) {
      if (run.signal.aborted || this.current !== run) return;
      // What was explained stays on the board; the student is told the rest is missing.
      this.set(
        played
          ? { status: "done", waiting: false, canReplay: false, error: STOPPED, lastFinished: this.snapshot.question }
          : { status: "error", waiting: false, canReplay: false, error: forStudent(error) },
      );
    }
  }

  private set(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}
