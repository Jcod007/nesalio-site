/**
 * Ce qui arrive au tableau pendant une vidéo du studio.
 *
 * Partagé par le lecteur (engine/studioPlayer.ts) et la vérification
 * (check.ts) : la vidéo vérifiée est exactement celle qui sera jouée.
 */
import { emptyBoard, pruneErased, type BoardState } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import type { Timeline, TimelineShot } from "./timeline";

/** Joue un plan au tableau ; `videoStart` est l'heure (horloge du lecteur) du début de la vidéo. */
export function applyShot(board: BoardState, shot: TimelineShot, videoStart: number, instant = false): BoardState {
  const shotStart = videoStart + shot.startMs;
  let next = pruneErased(board, shotStart);
  for (const planned of shot.actions) {
    // « instant » : posé d'un coup (aperçu repris au milieu de la vidéo), sans rejouer les animations.
    next = applyAction(next, planned.action, { start: shotStart + planned.offset, duration: instant ? 1 : planned.duration });
  }
  return next;
}

/** L'état du tableau à la fin de chaque plan (vidéo commencée à l'heure 0). */
export function boardsAfterShots(timeline: Timeline): BoardState[] {
  const boards: BoardState[] = [];
  let board = emptyBoard();
  for (const shot of timeline.shots) {
    board = applyShot(board, shot, 0);
    boards.push(pruneErased(board, shot.startMs + shot.durationMs));
  }
  return boards;
}

/**
 * L'état du tableau juste avant le plan `position` (rang dans la chronologie), posé d'un coup :
 * pour reprendre l'aperçu à ce plan sans rejouer tout le début.
 */
export function boardBeforeShot(timeline: Timeline, position: number, videoStart: number): BoardState {
  let board = emptyBoard();
  for (const shot of timeline.shots.slice(0, position)) board = applyShot(board, shot, videoStart, true);
  const at = timeline.shots[position];
  return at ? pruneErased(board, videoStart + at.startMs) : board;
}
