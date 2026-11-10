/** Régressions de séance relevées lors de la revue des modules. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Player } from '@/engine/player';
import type { Clock, Speaker, TutorSource } from '@/engine/ports';
import { createModelOutputParser } from '@/domain/tutor/modelOutput';
import { createVoiceInput } from '@/services/voice/voiceInput';
import { emptyBoard } from '@/domain/board/state';
import { applyAction } from '@/domain/scene/commands';

const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const clock: Clock = { now: () => 1000, sleep: async () => {} };
const speaker: Speaker = { estimate: () => 1, speak: () => ({ done: Promise.resolve() }), cancel() {} };

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Audit — behaviors to repair', () => {
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
    if (first?.kind !== 'step' || second?.kind !== 'step' || !first.do || !second.do) throw new Error('Invalid fixture');
    expect(second.do[0]).not.toHaveProperty('id', (first.do[0] as { id: string }).id);
    let board = emptyBoard();
    for (const action of [...first.do, ...second.do]) board = applyAction(board, action, { start: 0, duration: 0 });
    expect(Object.values(board.nodes).filter((node) => node.type === 'point')).toHaveLength(2);
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
});
