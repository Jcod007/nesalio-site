/**
 * Les « ports » du moteur : ce dont le lecteur a besoin du monde extérieur.
 *
 * Le lecteur ne sait pas comment on parle (voix du navigateur, voix clonée
 * via une API…), d'où viennent les étapes (modèle, démo, test) ni quelle
 * heure il est. Chaque implémentation se branche ici sans toucher au moteur.
 */
import type { StreamEvent } from "@/domain/scene/schema";
import type { TutorRequest } from "@/domain/tutor/request";
import type { SpeechSpan } from "@/domain/timeline/spokenTime";

export interface SpeechHandle {
  /** Se résout quand la phrase est finie ou interrompue. */
  done: Promise<void>;
  /**
   * Se résout quand le son commence vraiment (ou tout de suite si on ne peut
   * pas le savoir). Le tableau attend ce moment pour dessiner : l'image ne
   * doit jamais devancer la voix.
   */
  started?: Promise<void>;
}

export interface Speaker {
  /** Durée prévue de la phrase, en ms (sert à synchroniser les tracés). */
  estimate(text: string): number;
  speak(text: string): SpeechHandle;
  /** Coupe la phrase en cours. */
  cancel(): void;
  /**
   * Facultatif : prépare la phrase (par exemple, génère l'audio) et renvoie
   * sa durée réelle en ms. Le lecteur s'en sert pour caler les tracés.
   */
  prepare?(text: string): Promise<number>;
  /**
   * Facultatif : partie vraiment parlée de l'audio préparé (sans les silences
   * du début et de la fin), en ms. Les repères {id} y sont répartis.
   */
  speechSpan?(text: string): SpeechSpan | undefined;
  /** Facultatif : commence à préparer une phrase qui viendra bientôt. */
  prefetch?(text: string): void;
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
