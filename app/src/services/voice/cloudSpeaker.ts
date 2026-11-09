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
import { realClock, type Clock, type SpeechHandle } from "@/engine/ports";
import type { BrowserSpeaker } from "./browserSpeaker";
import { fetchVoiceClip, readClipDuration } from "./voiceClip";
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
// Laisse au serveur sa fenêtre de synthèse, plus le transfert de l'audio.
const FETCH_TIMEOUT_MS = 15_000;
const METADATA_TIMEOUT_MS = 3_000;

export interface CloudSpeaker extends BrowserSpeaker {
  readonly mode: "cloud" | "browser";
  setPaused(paused: boolean): void;
  fork(fallback: BrowserSpeaker, clock: Clock): CloudSpeaker;
}

export function createCloudSpeaker(fallback: BrowserSpeaker, endpoint = "/api/voice", clock: Clock = realClock, sharedLoad?: (text: string) => Promise<Clip | null>): CloudSpeaker {
  const clips = new Map<string, Promise<Clip | null>>();
  /** Partie parlée des clips déjà arrivés (lecture synchrone pour le lecteur). */
  const spans = new Map<string, SpeechSpan>();
  let failures = 0;
  let disabled = false;
  let muted = false;
  let current: { finish: () => void; setPaused?: (paused: boolean) => void } | null = null;

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
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const responseAndBlob = fetchVoiceClip(endpoint, text, controller.signal);
      const { response, blob } = await Promise.race([responseAndBlob, new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("délai dépassé")); }, FETCH_TIMEOUT_MS);
      })]);
      if (response.status === 503) {
        disabled = true; // aucune voix configurée côté serveur
        return null;
      }
      if (!blob) throw new Error(String(response.status));
      const span = parseSpeechSpan(response.headers.get(SPEECH_SPAN_HEADER));
      const url = URL.createObjectURL(blob);
      let durationMs: number;
      try {
        const metadata = new AbortController();
        const stop = setTimeout(() => metadata.abort(), METADATA_TIMEOUT_MS);
        try { durationMs = Math.round(await readClipDuration(new Audio(), url, metadata.signal)); }
        finally { clearTimeout(stop); }
      }
      catch (error) { URL.revokeObjectURL(url); throw error; }
      failures = 0;
      if (span && span.endMs <= durationMs + 50) spans.set(text, span);
      return { url, durationMs, span };
    } catch {
      failures++;
      if (failures >= FAILURES_BEFORE_FALLBACK) disabled = true;
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function load(text: string): Promise<Clip | null> {
    if (sharedLoad) return sharedLoad(text);
    if (disabled) return Promise.resolve(null);
    const cached = clips.get(text);
    if (cached) return cached;
    const clip = fetchClip(text);
    remember(text, clip);
    return clip;
  }

  return {
    fork: (voice, playbackClock) => createCloudSpeaker(voice, endpoint, playbackClock, load),
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
    setPaused(value) {
      fallback.setPaused?.(value);
      current?.setPaused?.(value);
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

      const cancelled = new AbortController();
      let finish: () => void = () => {};
      let markStarted: () => void = () => {};
      const started = new Promise<void>((resolve) => (markStarted = resolve));
      const done = new Promise<void>((resolve) => {
        finish = () => {
          cancelled.abort();
          markStarted();
          resolve();
        };
        void load(text).then(async (clip) => {
          const playing = clock.waitUntilPlaying?.(cancelled.signal);
          if (playing) await playing;
          if (cancelled.signal.aborted) return;
          if (!clip) {
            // Pas d'audio pour cette phrase : la voix du navigateur prend le relais.
            const spoken = fallback.speak(text);
            void (spoken.started ?? Promise.resolve()).then(markStarted);
            spoken.done.then(resolve);
            current = { finish: () => { fallback.cancel(); markStarted(); resolve(); } };
            return;
          }
          const audio = new Audio(clip.url);
          let playRun = 0;
          let usingFallback = false;
          audio.onplaying = () => markStarted();
          const end = () => {
            markStarted();
            audio.onended = audio.onerror = audio.onplaying = null;
            if (current === playback) current = null;
            resolve();
          };
          audio.onended = end;
          audio.onerror = end;
          const playback = {
            finish: () => {
              if (usingFallback) fallback.cancel();
              audio.pause();
              end();
            },
            setPaused: (paused: boolean) => {
              if (usingFallback) return;
              if (paused) {
                playRun++;
                audio.pause();
              } else play();
            },
          };
          function play() {
            const run = ++playRun;
            void audio.play().catch(() => {
              if (current !== playback || run !== playRun || muted) return;
              usingFallback = true;
              const spoken = fallback.speak(text);
              void (spoken.started ?? Promise.resolve()).then(markStarted);
              void spoken.done.then(end);
            });
          }
          current = playback;
          play();
        });
      });
      current = { finish };
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

