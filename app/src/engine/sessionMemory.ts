/**
 * La mémoire d'une séance : ce que Nesa a dit, les objectifs annoncés, les
 * réponses de l'élève et la dernière fiche de diagnostic. Elle est rendue au
 * modèle à chaque tour (`context`) pour qu'il sache où en est l'élève.
 */
import type { Diagnosis } from "@/domain/scene/schema";
import type { StudentAnswer, TutorContext } from "@/domain/tutor/request";

/** Phrases gardées en mémoire, et nombre d'entre elles rendues au modèle. */
const MAX_HISTORY = 16;
const SPOKEN_IN_CONTEXT = 12;
const MAX_SENTENCE_CHARS = 320;
const MAX_GOALS = 4;
const MAX_ANSWERS = 8;
/** Même limite que la requête : une réponse plus longue serait refusée par le serveur. */
const MAX_ANSWER_CHARS = 300;

/** Ce que le lecteur connaît seul (le tableau, la question) ; la mémoire ajoute le reste. */
export type ContextBase = Pick<TutorContext, "title" | "originalQuestion" | "board" | "interrupted">;

export class SessionMemory {
  private history: string[] = [];
  /** Questions auxquelles l'élève a répondu dans la séance. */
  private answeredCount = 0;
  /** Objectifs de la séance (premier tour). */
  private goals: string[] = [];
  private answers: StudentAnswer[] = [];
  /** Dernière fiche de diagnostic de Nesa : rendue au modèle à chaque tour. */
  private diagnosis: Diagnosis | null = null;

  reset(): void {
    this.history = [];
    this.answeredCount = 0;
    this.goals = [];
    this.answers = [];
    this.diagnosis = null;
  }

  /** Une phrase dite par Nesa (ou la question posée). */
  remember(sentence: string): void {
    this.history.push(sentence.slice(0, MAX_SENTENCE_CHARS));
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  /** Les `count` dernières phrases dites. */
  recent(count: number): string[] {
    return this.history.slice(-count);
  }

  setGoals(goals: readonly string[]): void {
    this.goals = goals.slice(0, MAX_GOALS);
  }

  /** Bilan de repli quand la séance se termine sans résumé : ses objectifs. */
  summaryFallback(): string[] {
    return this.goals.slice(0, 3);
  }

  setDiagnosis(diagnosis: Diagnosis): void {
    this.diagnosis = diagnosis;
  }

  /** L'élève a répondu à une question de vérification. */
  countAnswer(): void {
    this.answeredCount++;
  }

  /** Réponse qui termine un tour, gardée pour les tours suivants. */
  logAnswer(answer: StudentAnswer): void {
    const trimmed = { ...answer, prompt: answer.prompt.slice(0, MAX_ANSWER_CHARS), picked: answer.picked.slice(0, MAX_ANSWER_CHARS) };
    this.answers = [...this.answers, trimmed].slice(-MAX_ANSWERS);
  }

  /** Le contexte envoyé au modèle : ce que sait le lecteur, plus la mémoire de la séance. */
  context(base: ContextBase): TutorContext {
    return {
      title: base.title,
      originalQuestion: base.originalQuestion,
      spoken: this.history.slice(-SPOKEN_IN_CONTEXT),
      board: base.board,
      interrupted: base.interrupted,
      answered: this.answeredCount,
      goals: this.goals.length > 0 ? this.goals : undefined,
      answers: this.answers.length > 0 ? this.answers.map(({ choices: _c, ...rest }) => rest) : undefined,
      diagnosis: this.diagnosis ?? undefined,
    };
  }
}
