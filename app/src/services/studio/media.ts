/**
 * Son et enregistrement du studio, dans le navigateur.
 *
 * - `MusicDeck` joue la musique de la vidéo, calée à l'instant où le lecteur
 *   commence (même départ pour l'aperçu et pour l'export).
 * - `recordVideo` enregistre le canevas de la vidéo et la musique ensemble
 *   (MediaRecorder), en temps réel : une vidéo de 30 s prend 30 s.
 */

export class MusicDeck {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private output: GainNode | null = null;

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.output = this.ctx.createGain();
      this.output.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** À appeler dans un geste de l'utilisateur (clic) : les navigateurs bloquent le son sinon. */
  async unlock(): Promise<void> {
    const ctx = this.context();
    if (ctx.state !== "running") await ctx.resume().catch(() => undefined);
  }

  /** Une piste audio de la musique, pour l'enregistrement. */
  stream(): MediaStream {
    const ctx = this.context();
    const destination = ctx.createMediaStreamDestination();
    this.output!.connect(destination);
    return destination.stream;
  }

  /**
   * Joue `buffer` à partir de `offsetMs` (temps vidéo), dans `leadMs`.
   * Renvoie l'instant `performance.now()` correspondant au départ réel du son.
   */
  play(buffer: AudioBuffer | null, offsetMs: number, leadMs: number, compensateLatency = true): number {
    this.stop();
    const startAt = performance.now() + leadMs;
    if (!buffer) return startAt;
    const ctx = this.context();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output!);
    // La latence des haut-parleurs retarde le son : à l'écoute, on le lance d'autant plus tôt.
    // Pas à l'export : l'enregistrement reçoit le son sans cette latence.
    const latency = compensateLatency ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0;
    source.start(Math.max(ctx.currentTime, ctx.currentTime + leadMs / 1000 - latency), Math.max(0, offsetMs / 1000));
    this.source = source;
    return startAt;
  }

  stop(): void {
    try {
      this.source?.stop();
    } catch {
      // déjà arrêtée
    }
    this.source?.disconnect();
    this.source = null;
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

/**
 * Le meilleur format d'enregistrement du navigateur : MP4 en H.264 (Chrome, Edge, Safari), sinon WebM.
 * Jamais un MP4 « nu » : Chromium y met du VP9, que beaucoup de téléphones ne lisent pas.
 */
export function pickRecordingType(): { mimeType: string; extension: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates: Array<[string, "mp4" | "webm"]> = [
    ["video/mp4;codecs=avc1.640028,mp4a.40.2", "mp4"],
    ["video/mp4;codecs=avc1,mp4a.40.2", "mp4"],
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm;codecs=vp8,opus", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [mimeType, extension] of candidates) if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType, extension };
  return null;
}

export interface Recording {
  blob: Blob;
  extension: "mp4" | "webm";
  /** Moments où l'image s'est figée plus de 150 ms (ordinateur trop occupé) : la vidéo a saccadé. */
  stalls: number;
}

/** Au-delà de cet écart entre deux images, l'œil voit un à-coup. */
const STALL_MS = 150;

/**
 * Enregistre le canevas (30 images/s) et la musique pendant `durationMs`.
 * `start` lance la vidéo (lecteur et musique) au moment où l'enregistrement commence.
 */
export async function recordVideo(options: {
  canvas: HTMLCanvasElement;
  audio: MediaStream | null;
  durationMs: number;
  start: () => void;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}): Promise<Recording> {
  const type = pickRecordingType();
  if (!type) throw new Error("Ce navigateur ne sait pas enregistrer de vidéo. Essaie avec Chrome ou Edge à jour.");
  const stream = options.canvas.captureStream(30);
  for (const track of options.audio?.getAudioTracks() ?? []) stream.addTrack(track);
  const recorder = new MediaRecorder(stream, { mimeType: type.mimeType, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 192_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start(500);
  options.start();

  const began = performance.now();
  const total = options.durationMs + 400;
  // Surveillance des images : un écart trop long entre deux images se verra dans la vidéo.
  let stalls = 0;
  let last = began;
  let watching = true;
  const watch = (now: number) => {
    if (now - last > STALL_MS && now - began > 300) stalls++;
    last = now;
    if (watching) requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const elapsed = performance.now() - began;
      options.onProgress?.(Math.min(1, elapsed / total));
      if (elapsed >= total || options.signal?.aborted) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
  watching = false;
  recorder.stop();
  await stopped;
  for (const track of stream.getVideoTracks()) track.stop();
  if (options.signal?.aborted) throw new DOMException("Export annulé", "AbortError");
  let blob = new Blob(chunks, { type: type.mimeType.split(";")[0] });
  // Un WebM enregistré par MediaRecorder n'annonce pas sa durée : on l'écrit, sinon certains lecteurs ne savent pas avancer.
  if (type.extension === "webm") {
    const { default: fixWebmDuration } = await import("fix-webm-duration");
    blob = await fixWebmDuration(blob, performance.now() - began, { logger: false });
  }
  return { blob, extension: type.extension, stalls };
}
