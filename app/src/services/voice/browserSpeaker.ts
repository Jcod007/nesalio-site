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
import { realClock, type Clock, type Speaker, type SpeechHandle } from "@/engine/ports";

const RATE = 1.04;

export interface BrowserSpeaker extends Speaker {
  setMuted(muted: boolean): void;
  setPaused?(paused: boolean): void;
  readonly supported: boolean;
}

export function createBrowserSpeaker(clock: Clock = realClock, { nativeVoice = true, watchVoices = true } = {}): BrowserSpeaker {
  const synth = nativeVoice && typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  let voice: SpeechSynthesisVoice | null = null;
  let muted = false;
  let cancelCurrent: (() => void) | null = null;
  let speaking = false;
  let synthesisPaused = false;

  const pickVoice = () => {
    if (!synth) return;
    const voices = synth.getVoices();
    // Les voix « naturelles » (Edge, Chrome, Safari améliorées) sonnent bien moins robotiques.
    const natural = /natural|neural|online|google|premium|enhanced|amélioré/i;
    const score = (v: SpeechSynthesisVoice) =>
      (natural.test(v.name) ? 5 : 0) + (v.lang === "fr-CA" ? 3 : v.lang.startsWith("fr") ? 1 : 0) + (v.localService ? 0 : 1);
    voice = voices.filter((v) => v.lang.startsWith("fr")).sort((a, b) => score(b) - score(a))[0] ?? null;
  };
  if (synth) {
    pickVoice();
    if (watchVoices) synth.addEventListener?.("voiceschanged", pickVoice);
  }

  const estimate = (text: string) => estimateSpeechMs(text, RATE);

  /** Phrase « silencieuse » : on attend simplement la durée estimée. */
  function silent(text: string): SpeechHandle {
    let finish: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      const timer = new AbortController();
      void clock.sleep(estimate(text), timer.signal).then(resolve);
      finish = () => {
        timer.abort();
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
      if (value && speaking) cancelCurrent?.();
    },
    setPaused(value) {
      if (value && speaking && !synthesisPaused) {
        synth?.pause?.();
        synthesisPaused = true;
      } else if (!value && synthesisPaused) {
        synth?.resume?.();
        synthesisPaused = false;
      }
    },
    speak(text) {
      cancelCurrent?.();
      if (!synth || muted) return silent(text);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice?.lang ?? "fr-CA";
      if (voice) utterance.voice = voice;
      utterance.rate = RATE;

      let markStarted: () => void = () => {};
      const timers = new AbortController();
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
        // Certains navigateurs n'émettent jamais « start » : on n'attend pas plus d'une seconde.
        void clock.sleep(1000, timers.signal).then(resolve);
      });
      utterance.onstart = () => markStarted();
      const done = new Promise<void>((resolve) => {
        // Certains navigateurs n'émettent jamais « end » : filet de sécurité.
        void clock.sleep(estimate(text) * 2 + 2500, timers.signal).then(() => {
          if (!timers.signal.aborted) finish();
        });
        function finish() {
          speaking = false;
          cancelCurrent = null;
          timers.abort();
          utterance.onend = utterance.onerror = null;
          markStarted();
          resolve();
        }
        utterance.onend = finish;
        utterance.onerror = finish;
        cancelCurrent = () => {
          synth.cancel();
          finish();
        };
      });
      speaking = true;
      synth.speak(utterance);
      return { done, started };
    },
    cancel() {
      const cancel = cancelCurrent;
      cancelCurrent = null;
      cancel?.();
    },
  };
}
