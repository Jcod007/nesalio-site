/**
 * Voix de Nesa avec la synthèse vocale du navigateur (gratuite, sans réseau).
 *
 * Choix de la voix : français du Canada d'abord, puis tout français. Sans
 * synthèse disponible, ou en mode muet, la phrase « dure » simplement le
 * temps estimé : les sous-titres et les tracés restent synchronisés.
 *
 * Pour brancher plus tard une voix clonée (voir LISEZMOI), il suffit d'écrire
 * un autre `Speaker` qui joue l'audio renvoyé par une route serveur.
 */
import { estimateSpeechMs } from "@/domain/timeline/plan";
import type { Speaker, SpeechHandle } from "@/engine/ports";

const RATE = 1.04;

export interface BrowserSpeaker extends Speaker {
  setMuted(muted: boolean): void;
  readonly supported: boolean;
}

export function createBrowserSpeaker(): BrowserSpeaker {
  const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  let voice: SpeechSynthesisVoice | null = null;
  let muted = false;
  let cancelCurrent: (() => void) | null = null;

  const pickVoice = () => {
    if (!synth) return;
    const voices = synth.getVoices();
    const score = (v: SpeechSynthesisVoice) =>
      (v.lang === "fr-CA" ? 4 : v.lang.startsWith("fr") ? 2 : 0) + (v.localService ? 0 : 1);
    voice = voices.filter((v) => v.lang.startsWith("fr")).sort((a, b) => score(b) - score(a))[0] ?? null;
  };
  if (synth) {
    pickVoice();
    synth.addEventListener?.("voiceschanged", pickVoice);
  }

  const estimate = (text: string) => estimateSpeechMs(text, RATE);

  /** Phrase « silencieuse » : on attend simplement la durée estimée. */
  function silent(text: string): SpeechHandle {
    let finish: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, estimate(text));
      finish = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    cancelCurrent = finish;
    return { done };
  }

  return {
    supported: synth !== null,
    estimate,
    setMuted(value) {
      muted = value;
      if (value) synth?.cancel();
    },
    speak(text) {
      cancelCurrent?.();
      if (!synth || muted) return silent(text);

      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice?.lang ?? "fr-CA";
      if (voice) utterance.voice = voice;
      utterance.rate = RATE;

      const done = new Promise<void>((resolve) => {
        // Certains navigateurs n'émettent jamais « end » : filet de sécurité.
        const safety = setTimeout(finish, estimate(text) * 2 + 2500);
        function finish() {
          clearTimeout(safety);
          utterance.onend = utterance.onerror = null;
          resolve();
        }
        utterance.onend = finish;
        utterance.onerror = finish;
        cancelCurrent = () => {
          synth.cancel();
          finish();
        };
      });
      synth.speak(utterance);
      return { done };
    },
    cancel() {
      const cancel = cancelCurrent;
      cancelCurrent = null;
      cancel?.();
      synth?.cancel();
    },
  };
}
