/**
 * Voix naturelle de Nesa : l'audio est généré par le serveur (/api/voice) et
 * joué dans le navigateur.
 *
 * - Chaque phrase est préparée d'avance (préchargement) pour éviter les blancs.
 * - `prepare()` renvoie la durée réelle de l'audio : les tracés s'y calent.
 * - Si le serveur ne répond pas (voix non configurée, réseau), on bascule
 *   sur la voix du navigateur, sans interrompre la séance.
 */
import type { SpeechHandle } from "@/engine/ports";
import type { BrowserSpeaker } from "./browserSpeaker";

interface Clip {
  url: string;
  durationMs: number;
}

const MAX_CLIPS = 16;
const FAILURES_BEFORE_FALLBACK = 2;

export interface CloudSpeaker extends BrowserSpeaker {
  readonly mode: "cloud" | "browser";
}

export function createCloudSpeaker(fallback: BrowserSpeaker, endpoint = "/api/voice"): CloudSpeaker {
  const clips = new Map<string, Promise<Clip | null>>();
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
      void evicted?.then((c) => c && URL.revokeObjectURL(c.url));
    }
  }

  async function fetchClip(text: string): Promise<Clip | null> {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (response.status === 503) {
        disabled = true; // aucune voix configurée côté serveur
        return null;
      }
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const durationMs = await measure(url);
      failures = 0;
      return { url, durationMs };
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
    speak(text): SpeechHandle {
      current?.finish();
      if (muted || disabled) return fallback.speak(text);

      let cancelled = false;
      let finish: () => void = () => {};
      const done = new Promise<void>((resolve) => {
        finish = () => {
          cancelled = true;
          resolve();
        };
        void load(text).then((clip) => {
          if (cancelled) return;
          if (!clip) {
            // Pas d'audio pour cette phrase : la voix du navigateur prend le relais.
            fallback.speak(text).done.then(resolve);
            current = { audio: new Audio(), finish: () => { fallback.cancel(); resolve(); } };
            return;
          }
          const audio = new Audio(clip.url);
          const end = () => {
            audio.onended = audio.onerror = null;
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
            fallback.speak(text).done.then(end);
          });
        });
      });
      current = { audio: new Audio(), finish };
      return { done };
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
