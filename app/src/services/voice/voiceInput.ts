/**
 * Micro : ce que l'élève dit à Nesa.
 *
 * Méthode principale (tous les navigateurs récents) : on enregistre la voix,
 * on détecte la fin de la phrase (silence), puis le serveur la transcrit
 * (/api/transcribe). Si le serveur n'a pas de transcription configurée, on
 * se rabat sur la reconnaissance vocale du navigateur (Chrome, Edge, Safari).
 */
import { createSpeechListener } from "./speechListener";
import { sessionHeaders } from "@/services/session";

export type VoiceInputState = "idle" | "recording" | "transcribing";

export interface VoiceInputHandlers {
  onState(state: VoiceInputState): void;
  /** Niveau sonore, de 0 à 1 (pour l'animation du micro). */
  onLevel?(level: number): void;
  /** Texte partiel (reconnaissance du navigateur seulement). */
  onPartial?(text: string): void;
  onResult(text: string): void;
  onError(message: string): void;
}

export interface VoiceInput {
  readonly supported: boolean;
  start(handlers: VoiceInputHandlers): void;
  /** Termine l'enregistrement et envoie ce qui a été dit. */
  stop(): void;
  /** Abandonne sans rien envoyer. */
  cancel(): void;
}

const SILENCE_MS = 1400;
const NO_SPEECH_MS = 8000;
const MAX_MS = 30_000;

let serverTranscription: "unknown" | "ok" | "unavailable" = "unknown";

export function createVoiceInput(): VoiceInput {
  const recorder = createRecorderInput();
  const browser = createBrowserInput();
  const pick = () => (recorder.supported && serverTranscription !== "unavailable" ? recorder : browser);
  let active: VoiceInput | null = null;
  return {
    get supported() {
      return recorder.supported || browser.supported;
    },
    start(handlers) {
      active = pick();
      active.start(handlers);
    },
    stop: () => active?.stop(),
    cancel: () => active?.cancel(),
  };
}

/* ------------------------- enregistrement + serveur ------------------------- */

function createRecorderInput(endpoint = "/api/transcribe"): VoiceInput {
  const supported =
    typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  let stopRecording: ((send: boolean) => void) | null = null;

  return {
    supported,
    start(handlers) {
      if (!supported) return;
      stopRecording?.(false);
      void record(handlers);
    },
    stop: () => stopRecording?.(true),
    cancel: () => stopRecording?.(false),
  };

  async function record(handlers: VoiceInputHandlers) {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (error) {
      handlers.onState("idle");
      handlers.onError(
        (error as DOMException)?.name === "NotAllowedError"
          ? "Autorise le micro dans ton navigateur pour parler à Nesa."
          : "Je n'arrive pas à ouvrir ton micro.",
      );
      return;
    }

    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find((type) =>
      MediaRecorder.isTypeSupported?.(type),
    );
    const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);

    // Détection de la voix et du silence à partir du volume.
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    let quietest = Number.POSITIVE_INFINITY;
    let heardSpeech = false;
    let lastVoiceAt = startedAt;
    let send = true;
    let meter: ReturnType<typeof setInterval> | undefined;

    const finish = (shouldSend: boolean) => {
      if (stopRecording === null) return;
      stopRecording = null;
      send = shouldSend && heardSpeech;
      clearInterval(meter);
      if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
    };
    stopRecording = finish;

    if (context.state === "suspended") await context.resume().catch(() => {});
    meter = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const rms = Math.sqrt(sum / samples.length);
      const now = performance.now();
      // Bruit de fond : le niveau le plus bas des premières 500 ms (l'élève peut parler tout de suite).
      if (now - startedAt < 500) quietest = Math.min(quietest, rms);
      const threshold = Math.min(0.045, Math.max(0.018, quietest * 2.5));
      handlers.onLevel?.(Math.min(1, rms / (threshold * 4)));
      if (rms > threshold) {
        heardSpeech = true;
        lastVoiceAt = now;
      }
      if (heardSpeech && now - lastVoiceAt > SILENCE_MS) finish(true);
      else if (!heardSpeech && now - startedAt > NO_SPEECH_MS) finish(false);
      else if (now - startedAt > MAX_MS) finish(true);
    }, 60);

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      handlers.onLevel?.(0);
      if (!send) {
        handlers.onState("idle");
        if (!heardSpeech) handlers.onError("Je n'ai rien entendu. Réessaie en parlant un peu plus fort ?");
        return;
      }
      handlers.onState("transcribing");
      try {
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || mimeType || "audio/webm" });
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...sessionHeaders() },
          body: JSON.stringify({ audio: await toBase64(blob), mediaType: blob.type }),
        });
        if (response.status === 503) {
          serverTranscription = "unavailable";
          throw new Error("Le micro n'est pas encore branché sur le serveur. Réessaie : j'utilise celui du navigateur.");
        }
        if (!response.ok) throw new Error("Je n'ai pas bien compris. Réessaie ?");
        serverTranscription = "ok";
        const { text } = (await response.json()) as { text?: string };
        handlers.onState("idle");
        if (text?.trim()) handlers.onResult(text.trim());
        else handlers.onError("Je n'ai pas bien compris. Réessaie ?");
      } catch (error) {
        handlers.onState("idle");
        handlers.onError((error as Error).message || "Je n'ai pas bien compris. Réessaie ?");
      }
    };

    mediaRecorder.start(250);
    handlers.onState("recording");
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/* --------------------- reconnaissance vocale du navigateur --------------------- */

function createBrowserInput(): VoiceInput {
  const listener = createSpeechListener("fr-CA");
  return {
    supported: listener.supported,
    start(handlers) {
      let heard = "";
      handlers.onState("recording");
      listener.start({
        onText(text) {
          heard = text;
          handlers.onPartial?.(text);
        },
        onEnd() {
          handlers.onState("idle");
          if (heard.trim()) handlers.onResult(heard.trim());
        },
        onError(code) {
          handlers.onState("idle");
          handlers.onError(code === "not-allowed" ? "Autorise le micro dans ton navigateur pour parler à Nesa." : "Je n'ai pas bien entendu. Réessaie ?");
        },
      });
    },
    stop: () => listener.stop(),
    cancel: () => listener.stop(),
  };
}
