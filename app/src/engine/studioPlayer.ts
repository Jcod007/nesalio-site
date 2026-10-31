/**
 * Le lecteur du studio : joue la chronologie d'une vidéo au tableau.
 *
 * Plus simple que le lecteur du tuteur (pas de voix, pas de questions) : les
 * plans tombent à heure fixe, calés sur la musique. Il peut reprendre à
 * n'importe quel plan (le tableau d'avant est posé d'un coup), ce qui permet
 * de revoir un plan sans rejouer toute la vidéo.
 *
 * Ne dépend ni de React ni du navigateur : l'horloge est un port.
 */
import { emptyBoard, pruneErased, type BoardState } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import { boardBeforeShot } from "@/domain/studio/stage";
import type { Timeline } from "@/domain/studio/timeline";
import type { Clock } from "./ports";

export type StudioStatus = "idle" | "playing" | "done";

export interface StudioSnapshot {
  status: StudioStatus;
  board: BoardState;
  /** Heure (horloge du lecteur) du début de la vidéo ; le temps vidéo vaut `now - videoStart`. */
  videoStart: number | null;
  /** Rang du plan en cours dans la chronologie, -1 avant le premier. */
  position: number;
}

export const IDLE_STUDIO: StudioSnapshot = { status: "idle", board: emptyBoard(), videoStart: null, position: -1 };

/** Le plan est posé un peu avant son heure : le moteur lance les animations à l'heure exacte. */
const LOOKAHEAD_MS = 80;

export class StudioPlayer {
  private snapshot: StudioSnapshot = IDLE_STUDIO;
  private readonly listeners = new Set<() => void>();
  private run = 0;
  private abort: AbortController | null = null;

  constructor(private readonly clock: Clock) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StudioSnapshot => this.snapshot;

  private set(patch: Partial<StudioSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /**
   * Lance la vidéo au plan `from` (rang dans la chronologie), dans `leadMs`.
   * Renvoie l'heure du début de la vidéo (pour caler la musique au même instant).
   */
  play(timeline: Timeline, from = 0, leadMs = 150): number {
    this.stop();
    const run = ++this.run;
    const abort = new AbortController();
    this.abort = abort;
    const first = timeline.shots[Math.max(0, Math.min(from, timeline.shots.length - 1))];
    const offset = first?.startMs ?? 0;
    const videoStart = this.clock.now() + leadMs - offset;
    const position = first ? timeline.shots.indexOf(first) : 0;
    this.set({ status: "playing", videoStart, position: position - 1, board: boardBeforeShot(timeline, position, videoStart) });
    void this.loop(timeline, position, videoStart, run, abort.signal);
    return videoStart;
  }

  stop(): void {
    this.run++;
    this.abort?.abort();
    this.abort = null;
    if (this.snapshot.status === "playing") this.set({ status: "idle", videoStart: null, position: -1 });
  }

  /** Tableau vierge (nouveau script). */
  reset(): void {
    this.stop();
    this.set({ ...IDLE_STUDIO, board: emptyBoard() });
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
  }

  private async loop(timeline: Timeline, from: number, videoStart: number, run: number, signal: AbortSignal) {
    const { clock } = this;
    const waitUntil = (at: number) => clock.sleep(at - clock.now(), signal);

    for (let i = from; i < timeline.shots.length; i++) {
      const shot = timeline.shots[i]!;
      const shotStart = videoStart + shot.startMs;
      await waitUntil(shotStart - LOOKAHEAD_MS);
      if (run !== this.run) return;
      this.set({ board: pruneErased(this.snapshot.board, shotStart), position: i });
      // Chaque commande est posée au tableau juste avant son départ, pas toutes au début du plan :
      // un objet posé d'avance s'affichait un instant en entier avant que son tracé ne commence.
      const planned = [...shot.actions].sort((a, b) => a.offset - b.offset);
      for (let k = 0; k < planned.length; ) {
        const offset = planned[k]!.offset;
        await waitUntil(shotStart + offset - LOOKAHEAD_MS);
        if (run !== this.run) return;
        let board = this.snapshot.board;
        // Les commandes qui partent au même moment sont posées ensemble, dans l'ordre du script.
        for (; k < planned.length && planned[k]!.offset === offset; k++) {
          board = applyAction(board, planned[k]!.action, { start: shotStart + offset, duration: planned[k]!.duration });
        }
        this.set({ board });
      }
    }
    await waitUntil(videoStart + timeline.totalMs);
    if (run !== this.run) return;
    this.set({ status: "done", position: timeline.shots.length });
  }
}
