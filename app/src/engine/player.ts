/**
 * Le lecteur de séance : la machine à états qui joue les étapes.
 *
 *   idle ──ask──▶ thinking ──1re étape──▶ playing ──fin──▶ done
 *                                          │  ▲
 *                                interrupt │  │ resume
 *                                          ▼  │
 *                                         paused ──followUp──▶ thinking (réponse à l'interruption)
 *
 * Les étapes arrivent en flux : la première est jouée pendant que le modèle
 * écrit les suivantes. La séance avance par tours : un tour se termine sur
 * une question (« await ») ; dès que l'élève répond, le tour suivant est
 * demandé, pendant que Nesa réagit à voix haute à sa réponse. Une interruption empile une « séquence » de réponse
 * au-dessus de la séance ; quand elle est jouée, la séance reprend à l'étape
 * suivante, avec le tableau tel qu'il était.
 *
 * Le lecteur ne dépend ni de React ni du navigateur : tout passe par les
 * ports (voix, source, horloge), ce qui le rend testable de bout en bout.
 */
import { applyAction, emptyBoard, pruneErased, summarizeBoard, type BoardState } from "@/domain/board/state";
import type { Check, Mood, Step } from "@/domain/scene/schema";
import { planStep } from "@/domain/timeline/plan";
import type { StudentAnswer, TutorContext, TutorRequest } from "@/domain/tutor/request";
import type { Clock, Speaker, TutorSource } from "./ports";

export type PlayerStatus = "idle" | "thinking" | "playing" | "paused" | "checking" | "done" | "error";

export interface Caption {
  text: string;
  mood: Mood;
  startedAt: number;
  durationMs: number;
}

export interface ActiveCheck extends Check {
  picked: number | null;
}

export interface PlayerSnapshot {
  status: PlayerStatus;
  board: BoardState;
  title: string | null;
  topic: string | null;
  source: "model" | "demo" | null;
  /** Question qui a ouvert la séance. */
  question: string | null;
  caption: Caption | null;
  check: ActiveCheck | null;
  summary: string[];
  error: string | null;
  /** Vrai pendant que Nesa répond à une interruption. */
  answeringFollowUp: boolean;
}

export const INITIAL_SNAPSHOT: PlayerSnapshot = {
  status: "idle",
  board: emptyBoard(),
  title: null,
  topic: null,
  source: null,
  question: null,
  caption: null,
  check: null,
  summary: [],
  error: null,
  answeringFollowUp: false,
};

/** Pause entre deux étapes, pour laisser le temps de regarder le tableau. */
export const PAUSE_BETWEEN_STEPS_MS = 350;
const MAX_HISTORY = 16;
const PREPARE_TIMEOUT_MS = 8000;

interface Segment {
  kind: "question" | "followUp";
  steps: Step[];
  /** Étape en cours (ou prochaine à jouer). */
  cursor: number;
  /** Les commandes des étapes d'indice < appliedUpTo sont déjà au tableau. */
  appliedUpTo: number;
  streamDone: boolean;
  inProgress: boolean;
  /** Après une interruption : rejouer la phrase coupée, ou passer à la suite. */
  resumeAt: "replay" | "next" | null;
  /** Le tour s'est terminé sur une question : la suite viendra après la réponse. */
  awaiting: boolean;
  /** Réponse de l'élève en attente d'être envoyée (le flux du tour n'est pas encore fermé). */
  pendingAnswer: StudentAnswer | null;
  /** Indice de la dernière étape dont la question a reçu une réponse. */
  answeredStep: number;
  summary: string[];
  error: string | null;
  abort: AbortController;
}

export interface PlayerDeps {
  speaker: Speaker;
  source: TutorSource;
  clock: Clock;
}

export class Player {
  private snapshot: PlayerSnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private segments: Segment[] = [];
  private history: string[] = [];
  /** Questions auxquelles l'élève a répondu dans la séance. */
  private answeredCount = 0;
  private session = 0;
  private loopSession = -1;
  private stepAbort: AbortController | null = null;
  private wakers: Array<() => void> = [];
  private answerResolver: ((choice: number | null) => void) | null = null;

  constructor(private readonly deps: PlayerDeps) {}

  /* ------------------------------ abonnement ------------------------------ */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PlayerSnapshot => this.snapshot;

  private set(patch: Partial<PlayerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /* ------------------------------- commandes ------------------------------- */

  /** Nouvelle question : tableau vierge. */
  ask(question: string): void {
    this.reset();
    this.set({ ...INITIAL_SNAPSHOT, status: "thinking", question, board: emptyBoard() });
    this.openSegment("question", { mode: "question", question });
  }

  /** Question sur la séance en cours (après une interruption, ou une fois la séance finie). */
  followUp(text: string): void {
    const status = this.snapshot.status;
    if (status === "idle" || status === "error" || this.snapshot.question === null) {
      this.ask(text);
      return;
    }
    const interrupted = status === "paused" || status === "playing" || status === "checking";
    const parent = this.segments.at(-1);
    if (parent) {
      // Une question laissée sans réponse sera reposée ; sinon, on passe à l'étape suivante.
      const pendingQuestion = parent.steps[parent.cursor]?.check !== undefined && parent.answeredStep !== parent.cursor;
      parent.resumeAt = parent.inProgress ? (pendingQuestion ? "replay" : "next") : null;
    }
    this.stopCurrentStep();

    const context = this.buildContext(interrupted);
    this.set({ status: "thinking", check: null, error: null, answeringFollowUp: true });
    this.openSegment("followUp", { mode: "followUp", question: text, context });
  }

  /** « Attends, je comprends pas » : Nesa se tait et attend. */
  interrupt(): void {
    const status = this.snapshot.status;
    if (status !== "playing" && status !== "checking" && status !== "thinking") return;
    const segment = this.segments.at(-1);
    // Une question déjà répondue n'est pas reposée : on reprendra à l'étape suivante.
    if (segment?.inProgress) segment.resumeAt = segment.answeredStep === segment.cursor ? "next" : "replay";
    this.stopCurrentStep();
    this.set({ status: "paused", check: null });
  }

  /** Reprend après une interruption, en redisant la phrase coupée. */
  resume(): void {
    if (this.snapshot.status !== "paused") return;
    const segment = this.segments.at(-1);
    if (segment?.resumeAt === "next") {
      segment.cursor++;
      segment.inProgress = false;
      segment.resumeAt = null;
    }
    this.set({ status: this.segments.length > 0 ? "playing" : "done" });
    this.poke();
  }

  /** Réponse de l'élève à une question de vérification. */
  answer(choice: number): void {
    if (this.snapshot.status !== "checking" || !this.answerResolver) return;
    const resolve = this.answerResolver;
    this.answerResolver = null;
    resolve(choice);
  }

  /** Retour à l'écran d'accueil, tableau vierge. */
  stop(): void {
    this.reset();
    this.set({ ...INITIAL_SNAPSHOT, board: emptyBoard() });
  }

  /** Arrête tout (changement de page, démontage). */
  dispose(): void {
    this.reset();
    this.listeners.clear();
  }

  /* ------------------------------ fonctionnement ------------------------------ */

  private reset() {
    this.session++;
    for (const segment of this.segments) segment.abort.abort();
    this.segments = [];
    this.history = [];
    this.answeredCount = 0;
    this.stopCurrentStep();
    this.poke();
  }

  private stopCurrentStep() {
    this.stepAbort?.abort();
    this.stepAbort = null;
    this.deps.speaker.cancel();
    if (this.answerResolver) {
      const resolve = this.answerResolver;
      this.answerResolver = null;
      resolve(null);
    }
  }

  private openSegment(kind: Segment["kind"], request: TutorRequest) {
    const segment: Segment = {
      kind,
      steps: [],
      cursor: 0,
      appliedUpTo: 0,
      streamDone: false,
      inProgress: false,
      resumeAt: null,
      awaiting: false,
      pendingAnswer: null,
      answeredStep: -1,
      summary: [],
      error: null,
      abort: new AbortController(),
    };
    this.segments.push(segment);
    void this.consume(segment, request, this.session);
    this.ensureLoop();
  }

  /** L'élève a répondu à la question qui termine un tour : on demande le tour suivant. */
  private answered(segment: Segment, answer: StudentAnswer) {
    if (!segment.awaiting || segment.cursor !== segment.steps.length - 1) return;
    segment.pendingAnswer = answer;
    this.tryContinue(segment);
  }

  private tryContinue(segment: Segment) {
    if (!segment.pendingAnswer || !segment.streamDone || segment.abort.signal.aborted) return;
    const answer = segment.pendingAnswer;
    segment.pendingAnswer = null;
    segment.awaiting = false;
    segment.streamDone = false;
    const request: TutorRequest = {
      mode: "continue",
      question: this.snapshot.question ?? answer.prompt,
      context: this.buildContext(false),
      answer,
    };
    void this.consume(segment, request, this.session);
  }

  private async consume(segment: Segment, request: TutorRequest, session: number) {
    try {
      for await (const event of this.deps.source.open(request, segment.abort.signal)) {
        if (session !== this.session || segment.abort.signal.aborted) return;
        switch (event.kind) {
          case "source":
            this.set({ source: event.source });
            break;
          case "lesson":
            if (segment.kind === "question") this.set({ title: event.title, topic: event.topic ?? null });
            break;
          case "step": {
            const { kind: _kind, ...step } = event;
            segment.steps.push(step);
            // Une étape qui sera bientôt jouée : sa voix peut se préparer dès maintenant.
            if (segment.steps.length - 1 <= segment.cursor + 2) this.deps.speaker.prefetch?.(step.say);
            this.poke();
            break;
          }
          case "end":
            segment.summary = event.summary;
            break;
          case "error":
            segment.error = event.message;
            break;
          case "await":
            segment.awaiting = true;
            break;
        }
      }
    } catch {
      if (!segment.abort.signal.aborted) segment.error = "La connexion avec Nesa a été coupée. Réessaie ?";
    } finally {
      segment.streamDone = true;
      // L'élève a peut-être déjà répondu avant que le flux ne se ferme.
      if (session === this.session) this.tryContinue(segment);
      this.poke();
    }
  }

  private ensureLoop() {
    if (this.loopSession === this.session) {
      this.poke();
      return;
    }
    const session = this.session;
    this.loopSession = session;
    void this.loop(session);
  }

  private async loop(session: number) {
    while (session === this.session) {
      if (this.snapshot.status === "paused") {
        await this.waitWake();
        continue;
      }

      const segment = this.segments.at(-1);
      if (!segment) {
        this.set({ status: "done", caption: null, check: null, answeringFollowUp: false });
        this.loopSession = -1;
        return;
      }

      if (segment.cursor < segment.steps.length) {
        const completed = await this.playStep(segment);
        if (session !== this.session) return;
        if (completed) {
          segment.cursor++;
          segment.inProgress = false;
          segment.resumeAt = null;
        }
        continue;
      }

      if (!segment.streamDone) {
        if (this.snapshot.status !== "thinking") this.set({ status: "thinking" });
        await this.waitWake();
        continue;
      }

      // Séquence terminée.
      this.segments.pop();
      if (segment.error && segment.steps.length === 0) {
        if (segment.kind === "question") {
          this.set({ status: "error", error: segment.error, caption: null });
          this.segments = [];
          this.loopSession = -1;
          return;
        }
        this.set({ error: segment.error });
      }
      if (segment.kind === "question") this.set({ summary: segment.summary });

      const parent = this.segments.at(-1);
      if (segment.kind === "followUp") this.set({ answeringFollowUp: false });
      if (parent?.resumeAt === "next") {
        parent.cursor++;
        parent.inProgress = false;
        parent.resumeAt = null;
      }
    }
  }

  /** Joue une étape. Renvoie `false` si elle a été interrompue. */
  private async playStep(segment: Segment): Promise<boolean> {
    const { speaker, clock } = this.deps;
    const step = segment.steps[segment.cursor]!;
    const abort = new AbortController();
    this.stepAbort = abort;
    segment.inProgress = true;

    // La phrase est préparée (voix générée) avant de dessiner : les tracés se calent sur sa vraie durée.
    const speechMs = await this.prepareSpeech(step.say, abort.signal);
    if (abort.signal.aborted) return false;
    const next = segment.steps[segment.cursor + 1];
    if (next) speaker.prefetch?.(next.say);
    if (step.check?.ifRight) speaker.prefetch?.(step.check.ifRight);
    if (step.check?.ifWrong) speaker.prefetch?.(step.check.ifWrong);

    const now = clock.now();
    let drawingMs = 0;

    if (segment.appliedUpTo <= segment.cursor) {
      const plan = planStep(step.do, speechMs);
      let board = pruneErased(this.snapshot.board, now);
      for (const planned of plan.actions) {
        board = applyAction(board, planned.action, { start: now + planned.offset, duration: planned.duration });
      }
      drawingMs = plan.drawingMs;
      segment.appliedUpTo = segment.cursor + 1;
      this.set({ board });
    }

    if (segment.resumeAt !== "replay") this.remember(step.say);
    this.set({
      status: "playing",
      check: null,
      error: null,
      caption: { text: step.say, mood: step.mood ?? "explique", startedAt: now, durationMs: speechMs },
    });

    const speech = speaker.speak(step.say);
    if (!(await this.race(Promise.all([speech.done, clock.sleep(drawingMs, abort.signal)]), abort.signal))) {
      return false;
    }

    if (step.check) {
      const check = step.check;
      this.set({
        status: "checking",
        check: { ...check, picked: null },
        caption: { text: check.prompt, mood: "question", startedAt: clock.now(), durationMs: speaker.estimate(check.prompt) },
      });
      const picked = await this.waitAnswer();
      if (picked === null || abort.signal.aborted) return false;

      // Sans bonne réponse (question pour situer l'élève), pas de verdict.
      const right = check.answer === undefined ? null : picked === check.answer;
      this.remember(check.prompt);
      this.answeredCount++;
      segment.answeredStep = segment.cursor;
      // Le tour suivant est demandé tout de suite : il s'écrit pendant que Nesa réagit.
      this.answered(segment, {
        prompt: check.prompt,
        choices: check.choices,
        picked: check.choices[picked] ?? String(picked),
        correct: right,
      });
      this.set({ status: "playing", check: { ...check, picked } });
      if (right !== null) {
        const feedback = right ? (check.ifRight ?? "Exact !") : (check.ifWrong ?? "Pas tout à fait.");
        this.remember(feedback);
        this.set({
          caption: { text: feedback, mood: right ? "bravo" : "idee", startedAt: clock.now(), durationMs: speaker.estimate(feedback) },
        });
        if (!(await this.race(speaker.speak(feedback).done, abort.signal))) return false;
      }
    }

    await clock.sleep(PAUSE_BETWEEN_STEPS_MS, abort.signal);
    return !abort.signal.aborted;
  }

  /** Durée réelle de la phrase si la voix sait la préparer (8 s au plus), sinon l'estimation. */
  private async prepareSpeech(text: string, signal: AbortSignal): Promise<number> {
    const { speaker, clock } = this.deps;
    const fallback = speaker.estimate(text);
    if (!speaker.prepare) return fallback;
    const timeout = new AbortController();
    const onAbort = () => timeout.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await Promise.race([
        speaker.prepare(text).catch(() => fallback),
        clock.sleep(PREPARE_TIMEOUT_MS, timeout.signal).then(() => fallback),
      ]);
    } finally {
      timeout.abort();
      signal.removeEventListener("abort", onAbort);
    }
  }

  private remember(sentence: string) {
    this.history.push(sentence.slice(0, 320));
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  private buildContext(interrupted: boolean): TutorContext {
    return {
      title: this.snapshot.title ?? undefined,
      originalQuestion: this.snapshot.question ?? undefined,
      spoken: this.history.slice(-12),
      board: summarizeBoard(this.snapshot.board).slice(0, 40),
      interrupted,
      answered: this.answeredCount,
    };
  }

  /* ------------------------------ synchronisation ------------------------------ */

  private poke() {
    const wakers = this.wakers;
    this.wakers = [];
    for (const wake of wakers) wake();
  }

  private waitWake(): Promise<void> {
    return new Promise((resolve) => this.wakers.push(resolve));
  }

  private waitAnswer(): Promise<number | null> {
    return new Promise((resolve) => {
      this.answerResolver = resolve;
    });
  }

  /** `true` si la promesse se termine avant l'annulation, `false` sinon. */
  private race(promise: Promise<unknown>, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      const onAbort = () => resolve(false);
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        () => {
          signal.removeEventListener("abort", onAbort);
          resolve(!signal.aborted);
        },
        () => {
          signal.removeEventListener("abort", onAbort);
          resolve(false);
        },
      );
    });
  }
}
