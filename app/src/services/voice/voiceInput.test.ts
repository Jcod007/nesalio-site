import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceInput, MIC_UNAVAILABLE } from "./voiceInput";

/** A browser where the browser's own speech recognition exists: it must never be used. */
function browser(options: { recorder: boolean }) {
  const recognitions: unknown[] = [];
  const window = {
    location: { search: "" },
    SpeechRecognition: class { constructor() { recognitions.push(this); } start() {} abort() {} stop() {} },
  };
  vi.stubGlobal("window", window);
  vi.stubGlobal("navigator", { mediaDevices: options.recorder ? { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } : undefined });
  if (options.recorder) {
    vi.stubGlobal("MediaRecorder", class {
      static isTypeSupported() { return true; }
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;
      start() { this.state = "recording"; this.ondataavailable?.({ data: new Blob(["son"]) }); }
      stop() { this.state = "inactive"; void this.onstop?.(); }
    });
    // Loud from the start: speech is heard at the first meter tick.
    vi.stubGlobal("AudioContext", class {
      state = "running";
      createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(samples: Float32Array) { samples.fill(0.5); } }; }
      createMediaStreamSource() { return { connect() {} }; }
      close() { return Promise.resolve(); }
    });
    vi.stubGlobal("FileReader", class {
      result = "";
      onload?: () => void;
      readAsDataURL() { this.result = "data:audio/webm;base64,AAAA"; this.onload?.(); }
    });
  }
  return { recognitions };
}

/** Speaks once and returns what the student is told. */
async function speak(input: ReturnType<typeof createVoiceInput>) {
  const told = { errors: [] as string[], results: [] as string[] };
  input.start({ onState() {}, onError: (m) => told.errors.push(m), onResult: (t) => told.results.push(t) });
  await vi.advanceTimersByTimeAsync(100);
  input.stop();
  await vi.advanceTimersByTimeAsync(10);
  return told;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("micro de l'élève sans repli vers la reconnaissance du navigateur", () => {
  it("ne propose pas le micro du navigateur quand l'enregistrement n'est pas possible", () => {
    const { recognitions } = browser({ recorder: false });
    const input = createVoiceInput();
    expect(input.supported).toBe(false);
    input.start({ onState() {}, onError() {}, onResult() {} });
    expect(recognitions).toHaveLength(0);
  });

  it.each([502, 503, 401, 500])("transcription refusée (%i) : message clair, et toujours le serveur ensuite", async (status) => {
    vi.useFakeTimers();
    const { recognitions } = browser({ recorder: true });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status }));
    vi.stubGlobal("fetch", fetch);
    const input = createVoiceInput();
    expect((await speak(input)).errors).toEqual([MIC_UNAVAILABLE]);
    await speak(input);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(recognitions).toHaveLength(0);
  });

  it("transmet la phrase transcrite", async () => {
    vi.useFakeTimers();
    browser({ recorder: true });
    vi.stubGlobal("fetch", async () => Response.json({ text: " Comment trouver le sommet ? " }));
    expect((await speak(createVoiceInput())).results).toEqual(["Comment trouver le sommet ?"]);
  });
});
