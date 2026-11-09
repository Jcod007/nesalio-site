import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserSpeaker } from "./browserSpeaker";
import { createCloudSpeaker } from "./cloudSpeaker";
import { realClock } from "@/engine/ports";

const fallback: BrowserSpeaker = {
  supported: true,
  estimate: () => 999,
  speak: () => ({ done: Promise.resolve() }),
  cancel: () => {},
  setMuted: () => {},
};

/** Élément audio minimal : la durée est lue « dans les métadonnées » dès qu'on lui donne une source. */
class FakeAudio {
  duration = 4;
  preload = "";
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onloadedmetadata?.());
  }
}

function stubVoice(headers: Record<string, string>) {
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:clip", revokeObjectURL: () => {} });
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/wav", ...headers } }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createCloudSpeaker", () => {
  it("réutilise le clip déjà préparé pendant le direct pour le rejeu", async () => {
    stubVoice({});
    const fetchVoice = vi.fn(fetch);
    vi.stubGlobal("fetch", fetchVoice);
    const live = createCloudSpeaker(fallback);
    const replay = live.fork(fallback, realClock);
    expect(await live.prepare!("Bonjour.")).toBe(4000);
    expect(await replay.prepare!("Bonjour.")).toBe(4000);
    expect(fetchVoice).toHaveBeenCalledOnce();
  });

  it("reprend le même clip à la position où il était en pause", async () => {
    stubVoice({});
    const players: PlaybackAudio[] = [];
    class PlaybackAudio extends FakeAudio {
      currentTime = 0;
      onplaying: (() => void) | null = null;
      onended: (() => void) | null = null;
      play = vi.fn(async () => { this.onplaying?.(); });
      pause = vi.fn();
      constructor(url?: string) {
        super();
        if (url) players.push(this);
      }
    }
    vi.stubGlobal("Audio", PlaybackAudio);
    const speaker = createCloudSpeaker(fallback);
    const speech = speaker.speak("Bonjour.");
    await speech.started;
    const audio = players[0]!;
    audio.currentTime = 1.5;
    speaker.setPaused(true);
    expect(audio.pause).toHaveBeenCalledOnce();
    speaker.setPaused(false);
    expect(players).toHaveLength(1);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBe(1.5);
    audio.onended?.();
    await speech.done;
  });

  it("garde un audio qui arrive après l'ancien délai de huit secondes", async () => {
    vi.useFakeTimers();
    stubVoice({});
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", (_url: string, options: RequestInit) => {
      signal = options.signal;
      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(new Response(new Uint8Array([1, 2, 3]))), 8100);
      });
    });
    const duration = createCloudSpeaker(fallback).prepare!("Bonjour.");
    await vi.advanceTimersByTimeAsync(8200);
    expect(await duration).toBe(4000);
    expect(signal?.aborted).toBe(false);
  });

  it("garde la partie parlée envoyée par le serveur avec la durée de l'audio", async () => {
    stubVoice({ "X-Speech-Span": "310,3620" });
    const speaker = createCloudSpeaker(fallback);
    expect(await speaker.prepare!("Bonjour.")).toBe(4000);
    expect(speaker.speechSpan!("Bonjour.")).toEqual({ startMs: 310, endMs: 3620 });
  });

  it("n'invente pas de partie parlée quand le serveur n'en envoie pas (MP3)", async () => {
    stubVoice({});
    const speaker = createCloudSpeaker(fallback);
    await speaker.prepare!("Bonjour.");
    expect(speaker.speechSpan!("Bonjour.")).toBeUndefined();
  });

  it("écarte une partie parlée qui dépasse la durée de l'audio", async () => {
    stubVoice({ "X-Speech-Span": "100,9000" });
    const speaker = createCloudSpeaker(fallback);
    await speaker.prepare!("Bonjour.");
    expect(speaker.speechSpan!("Bonjour.")).toBeUndefined();
  });
});
