import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserSpeaker } from "./browserSpeaker";
import { createCloudSpeaker } from "./cloudSpeaker";

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

afterEach(() => vi.unstubAllGlobals());

describe("createCloudSpeaker", () => {
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
