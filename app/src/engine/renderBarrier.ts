/** Accusé de réception du lot associé à un état précis, sans dépendance de l'engine à React. */
import type { BoardState } from "@/domain/board/state";

const pending = new WeakMap<BoardState, () => void>();

export function waitForBoard(board: BoardState): Promise<void> {
  return new Promise((resolve) => pending.set(board, resolve));
}

export function boardRendered(board: BoardState): void {
  const resolve = pending.get(board);
  if (resolve) { pending.delete(board); resolve(); }
}

export function cancelBoardWait(board: BoardState): void { boardRendered(board); }
