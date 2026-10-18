/**
 * Voix naturelle de Nesa : l'audio est généré par le serveur (/api/voice) et
 * joué dans le navigateur.
 *
 * - Chaque phrase est préparée d'avance (préchargement) pour éviter les blancs.
 * - `prepare()` renvoie la durée réelle de l'audio, et `speechSpan()` la partie
 *   vraiment parlée (en-tête X-Speech-Span) : les tracés s'y calent.
 * - Si le serveur ne répond pas (voix non configurée, réseau), on bascule
 *   sur la voix du navigateur, sans interrompre la séance.
 */
import type { SpeechHandle } from "@/engine/ports";
import type { BrowserSpeaker } from "./browserSpeaker";
import { sessionHeaders } from "@/services/session";
import { parseSpeechSpan, SPEECH_SPAN_HEADER } from "@/domain/audio/speechSpan";
import type { SpeechSpan } from "@/domain/timeline/spokenTime";

interface Clip {
  url: string;
  durationMs: number;
  /** Partie vraiment parlée, envoyée par le serveur (absente pour un MP3). */
  span: SpeechSpan | null;
}

const MAX_CLIPS = 16;
const FAILURES_BEFORE_FALLBACK = 2;

export interface CloudSpeaker extends BrowserSpeaker {
  readonly mode: "cloud" | "browser";
}

export function createCloudSpeaker(fallback: BrowserSpeaker, endpoint = "/api/voice"): CloudSpeaker {
  const clips = new Map<string, Promise<Clip | null>>();
  /** Partie parlée des clips déjà arrivés (lecture synchrone pour le lecteur). */
  const spans = new Map<string, SpeechSpan>();
  let failures = 0;
  let disabled = false;
  let muted = false;
  let current: { audio: HTMLAudioElement; finish: () => void } | null = null;

  function remember(text: string, clip: Promise<Clip | null>) {
    clips.set(text, clip);
    while (clips.size > MAX_CLIPS) {
      const oldest = clips.keys().next().value!;
      const evicted = clips.get(oldest);
      clips.delete(oldest);
      spans.delete(oldest);
      void evicted?.then((c) => c && URL.revokeObjectURL(c.url));
    }
  }

  async function fetchClip(text: string): Promise<Clip | null> {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({ text }),
      });
      if (response.status === 503) {
        disabled = true; // aucune voix configurée côté serveur
        return null;
      }
      if (!response.ok) throw new Error(String(response.status));
      const span = parseSpeechSpan(response.headers.get(SPEECH_SPAN_HEADER));
      const url = URL.createObjectURL(await response.blob());
      const durationMs = await measure(url);
      failures = 0;
      if (span && span.endMs <= durationMs + 50) spans.set(text, span);
      return { url, durationMs, span };
    } catch {
      failures++;
      if (failures >= FAILURES_BEFORE_FALLBACK) disabled = true;
      return null;
    }
  }

  function load(text: string): Promise<Clip | null> {
    if (disabled) return Promise.resolve(null);
    const cached = clips.get(text);
    if (cached) return cached;
    const clip = fetchClip(text);
    remember(text, clip);
    return clip;
  }

  return {
    get mode() {
      return disabled ? "browser" : "cloud";
    },
    supported: true,
    estimate: (text) => fallback.estimate(text),
    setMuted(value) {
      muted = value;
      fallback.setMuted(value);
      if (value) current?.finish();
    },
    prefetch(text) {
      if (!muted) void load(text);
    },
    async prepare(text) {
      if (muted || disabled) return fallback.estimate(text);
      const clip = await load(text);
      return clip?.durationMs ?? fallback.estimate(text);
    },
    speechSpan(text) {
      return muted || disabled ? undefined : spans.get(text);
    },
    speak(text): SpeechHandle {
      current?.finish();
      if (muted || disabled) return fallback.speak(text);

      let cancelled = false;
      let finish: () => void = () => {};
      let markStarted: () => void = () => {};
      const started = new Promise<void>((resolve) => (markStarted = resolve));
      const done = new Promise<void>((resolve) => {
        finish = () => {
          cancelled = true;
          markStarted();
          resolve();
        };
        void load(text).then((clip) => {
          if (cancelled) return;
          if (!clip) {
            // Pas d'audio pour cette phrase : la voix du navigateur prend le relais.
            const spoken = fallback.speak(text);
            void (spoken.started ?? Promise.resolve()).then(markStarted);
            spoken.done.then(resolve);
            current = { audio: new Audio(), finish: () => { fallback.cancel(); resolve(); } };
            return;
          }
          const audio = new Audio(clip.url);
          audio.onplaying = () => markStarted();
          const end = () => {
            markStarted();
            audio.onended = audio.onerror = audio.onplaying = null;
            if (current?.audio === audio) current = null;
            resolve();
          };
          audio.onended = end;
          audio.onerror = end;
          current = {
            audio,
            finish: () => {
              audio.pause();
              end();
            },
          };
          audio.play().catch(() => {
            // Lecture bloquée (aucun geste de l'utilisateur) : on lit avec la voix du navigateur.
            const spoken = fallback.speak(text);
            void (spoken.started ?? Promise.resolve()).then(markStarted);
            spoken.done.then(end);
          });
        });
      });
      current = { audio: new Audio(), finish };
      return { done, started };
    },
    cancel() {
      const playing = current;
      current = null;
      playing?.finish();
      fallback.cancel();
    },
  };
}

/** Durée d'un fichier audio, en ms (métadonnées lues sans le jouer). */
function measure(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "metadata";
    const timer = setTimeout(() => reject(new Error("durée inconnue")), 5000);
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      const seconds = audio.duration;
      if (Number.isFinite(seconds) && seconds > 0) resolve(Math.round(seconds * 1000));
      else reject(new Error("durée inconnue"));
    };
    audio.onerror = () => {
      clearTimeout(timer);
      reject(new Error("audio illisible"));
    };
    audio.src = url;
  });
}
