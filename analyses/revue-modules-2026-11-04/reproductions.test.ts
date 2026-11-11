/** Audit probes: these assert the desired behavior and intentionally expose existing defects. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Player } from '@/engine/player';
import type { Clock, Speaker, TutorSource } from '@/engine/ports';
import { createHttpSource } from '@/services/tutor/httpSource';
import { createModelOutputParser } from '@/domain/tutor/modelOutput';
import { createVoiceInput } from '@/services/voice/voiceInput';
import { createCloudSpeaker } from '@/services/voice/cloudSpeaker';
import { withRecording } from '@/server/tutor/recording';

const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const clock: Clock = { now: () => 1000, sleep: async () => {} };
const speaker: Speaker = { estimate: () => 1, speak: () => ({ done: Promise.resolve() }), cancel() {} };

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Audit — behaviors to repair', () => {
  it('records an emitted error event as an error outcome', async () => {
    const finish = vi.fn();
    async function* events() { yield { kind: 'error' as const, code: 'upstream' as const, message: 'Service interrompu' }; }
    for await (const _event of withRecording(events(), { event() {}, finish })) { /* consume */ }
    expect(finish).toHaveBeenCalledWith('error');
  });
  it('reports a non-NDJSON HTTP failure instead of completing an empty lesson', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>Unavailable</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
    const player = new Player({ source: createHttpSource(), speaker, clock });
    try {
      player.ask('Explique les fractions.');
      await flush();
      expect(player.getSnapshot().status).toBe('error');
    } finally { player.dispose(); }
  });

  it('does not mark a stream without a terminal event as a completed lesson', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ kind: 'step', say: 'Voici la première étape.', do: [] }) + '\n'));
    const player = new Player({ source: createHttpSource(), speaker, clock });
    try {
      player.ask('Explique les fractions.');
      await flush();
      expect(player.getSnapshot().status).toBe('error');
    } finally { player.dispose(); }
  });

  it('keeps an answer submitted before the delayed await event', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const requests: string[] = [];
    const source: TutorSource = { async *open(request) {
      requests.push(request.mode);
      if (request.mode === 'question') {
        yield { kind: 'step', say: 'Combien ?', do: [], check: { prompt: 'Combien ?', choices: ['1', '2'], answer: 0 } };
        await waiting;
        yield { kind: 'await' };
      } else { yield { kind: 'end', summary: [] }; }
    } };
    const player = new Player({ source, speaker, clock });
    try {
      player.ask('Calcule.');
      await flush();
      expect(player.getSnapshot().status).toBe('checking');
      player.answer(0);
      await flush();
      release();
      await flush();
      expect(requests).toEqual(['question', 'continue']);
    } finally { release(); player.dispose(); }
  });

  it('assigns distinct fallback IDs across turns of the same board', () => {
    const line = JSON.stringify({ kind: 'step', say: 'Un point.', do: [{ type: 'point', at: [0, 0] }] });
    const first = createModelOutputParser().parseLine(line);
    const second = createModelOutputParser().parseLine(line);
    if (first?.kind !== 'step' || second?.kind !== 'step') throw new Error('Invalid fixture');
    expect(second.do[0]).not.toHaveProperty('id', (first.do[0] as { id: string }).id);
  });

  it('cancels microphone acquisition even when permission is still pending', async () => {
    vi.useFakeTimers();
    let grant!: (stream: unknown) => void;
    const acquisition = new Promise((resolve) => { grant = resolve; });
    const stopTrack = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => acquisition } });
    class Recorder {
      static isTypeSupported() { return true; }
      state = 'inactive';
      onstop?: () => void;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', Recorder);
    vi.stubGlobal('AudioContext', class {
      state = 'running';
      createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData() {} }; }
      createMediaStreamSource() { return { connect() {} }; }
      close() { return Promise.resolve(); }
    });
    const input = createVoiceInput();
    try {
      input.start({ onState() {}, onError() {}, onResult() {} });
      input.cancel();
      grant({ getTracks: () => [{ stop: stopTrack }] });
      await flush();
      expect(stopTrack).toHaveBeenCalled();
    } finally { input.cancel(); }
  });

  it('continues silently when the voice fetch never resolves', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    vi.stubGlobal('Audio', class {});
    const fallback = { ...speaker, supported: true, setMuted() {} };
    const cloud = createCloudSpeaker(fallback);
    const source: TutorSource = { async *open() {
      yield { kind: 'step', say: 'Voici le calcul.', do: [] };
      yield { kind: 'end', summary: [] };
    } };
    const realClock: Clock = { now: () => performance.now(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };
    const player = new Player({ source, speaker: cloud, clock: realClock });
    try {
      player.ask('Calcule.');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(player.getSnapshot().status).toBe('done');
    } finally { player.dispose(); }
  });
});
