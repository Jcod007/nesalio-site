import { describe, expect, it } from "vitest";
import { detectSpeechSpan, parseSpeechSpan } from "./speechSpan";

const RATE = 24_000;

/** Silence (léger souffle), son, silence : durées en ms. */
function clip(silenceBefore: number, voice: number, silenceAfter: number): Float32Array {
  const n = (ms: number) => Math.round((ms / 1000) * RATE);
  const samples = new Float32Array(n(silenceBefore) + n(voice) + n(silenceAfter));
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.002;
  for (let i = 0; i < n(voice); i++) samples[n(silenceBefore) + i] = 0.4 * Math.sin((2 * Math.PI * 180 * i) / RATE);
  return samples;
}

describe("detectSpeechSpan", () => {
  it("trouve le début et la fin de la voix, à quelques dizaines de ms près", () => {
    const span = detectSpeechSpan(clip(320, 2500, 450), RATE)!;
    expect(Math.abs(span.startMs - 320)).toBeLessThanOrEqual(30);
    expect(Math.abs(span.endMs - 2820)).toBeLessThanOrEqual(30);
  });

  it("ne coupe pas une pause courte au milieu de la phrase", () => {
    const a = clip(200, 800, 0);
    const b = clip(150, 800, 300);
    const joined = new Float32Array(a.length + b.length);
    joined.set(a);
    joined.set(b, a.length);
    const span = detectSpeechSpan(joined, RATE)!;
    expect(span.startMs).toBeLessThan(250);
    expect(span.endMs).toBeGreaterThan(1850);
  });

  it("renvoie null pour un audio sans voix", () => {
    expect(detectSpeechSpan(clip(1000, 0, 0), RATE)).toBeNull();
    expect(detectSpeechSpan(new Float32Array(0), RATE)).toBeNull();
  });
});

describe("parseSpeechSpan", () => {
  it("lit « début,fin » en ms", () => {
    expect(parseSpeechSpan("310,2840")).toEqual({ startMs: 310, endMs: 2840 });
  });

  it("refuse une valeur absente ou incohérente", () => {
    expect(parseSpeechSpan(null)).toBeNull();
    expect(parseSpeechSpan("abc")).toBeNull();
    expect(parseSpeechSpan("900,100")).toBeNull();
  });
});
