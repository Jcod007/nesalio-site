/**
 * Les « ports » du moteur : ce dont le lecteur a besoin du monde extérieur.
 *
 * Le lecteur ne sait pas comment on parle (voix du navigateur, voix clonée
 * via une API…), d'où viennent les étapes (modèle, démo, test) ni quelle
 * heure il est. Chaque implémentation se branche ici sans toucher au moteur.
 */
import type { StreamEvent } from "@/domain/scene/schema";
import type { TutorRequest } from "@/domain/tutor/request";

export interface SpeechHandle {
  /** Se résout quand la phrase est finie ou interrompue. */
  done: Promise<void>;
}

export interface Speaker {
  /** Durée prévue de la phrase, en ms (sert à synchroniser les tracés). */
  estimate(text: string): number;
  speak(text: string): SpeechHandle;
  /** Coupe la phrase en cours. */
  cancel(): void;
}

export interface TutorSource {
  open(request: TutorRequest, signal: AbortSignal): AsyncIterable<StreamEvent>;
}

export interface Clock {
  now(): number;
  /** Attend `ms`, ou moins si le signal est annulé (ne lève jamais). */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const realClock: Clock = {
  now: () => performance.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve) => {
      if (ms <= 0 || signal?.aborted) return resolve();
      const timer = setTimeout(done, ms);
      signal?.addEventListener("abort", done, { once: true });
      function done() {
        clearTimeout(timer);
        signal?.removeEventListener("abort", done);
        resolve();
      }
    }),
};
