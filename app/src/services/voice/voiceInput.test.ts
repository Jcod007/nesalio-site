import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceInput } from "./voiceInput";

afterEach(() => vi.unstubAllGlobals());

describe("guest microphone", () => {
  it("uses browser recognition directly without recording or server transcription", () => {
    const fetch = vi.fn();
    const getUserMedia = vi.fn();
    const start = vi.fn();
    class Recognition {
      start = start;
      abort = vi.fn();
      stop = vi.fn();
    }
    vi.stubGlobal("window", { SpeechRecognition: Recognition });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("fetch", fetch);
    const voice = createVoiceInput({ browserOnly: true });
    expect(voice.supported).toBe(true);
    voice.start({ onState: vi.fn(), onResult: vi.fn(), onError: vi.fn() });
    expect(start).toHaveBeenCalledOnce();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports microphone unavailable when browser recognition is absent", () => {
    vi.stubGlobal("window", {});
    expect(createVoiceInput({ browserOnly: true }).supported).toBe(false);
  });
});
