import { union, type Box, type Point } from "@/domain/nesalio/placement";

/** The little a highlight outline needs from a drawn object. */
export interface MarkHandle {
  opacity: number;
  shift(by: [number, number, number]): unknown;
  dispose(): void;
}

interface Cell { readonly parts: readonly string[]; readonly box: Box }

/**
 * Outlines around the highlighted parts of a table (cell `r2c3`, row `r2`,
 * column `c3`). They live outside the table's items, so each frame they follow
 * the table's position (`move`) and opacity (`dim`, `fade_out`).
 */
export class TableMarks<M extends MarkHandle> {
  private readonly marks = new Map<string, { mark: M; color: string; at: Point }>();

  constructor(private readonly board: {
    /** Builds an outline around a box given in world coordinates. */
    create(box: Box, color: string): M;
    add(mark: M): void;
    remove(mark: M): void;
  }) {}

  /** `highlights`: part id → colour; `position`: where the table's own origin is in the world. */
  update(cells: readonly Cell[], highlights: ReadonlyMap<string, string>, position: Point, opacity: number): void {
    for (const [part, entry] of this.marks) {
      if (highlights.get(part) !== entry.color) this.drop(part);
    }
    for (const [part, color] of highlights) {
      let entry = this.marks.get(part);
      if (!entry) {
        const box = union(cells.filter((cell) => cell.parts.includes(part)).map((cell) => cell.box));
        if (!box) continue;
        const inset = 0.04;
        const [x, y] = position;
        const mark = this.board.create({ x0: box.x0 + inset + x, y0: box.y0 + inset + y, x1: box.x1 - inset + x, y1: box.y1 - inset + y }, color);
        mark.opacity = opacity;
        this.board.add(mark);
        entry = { mark, color, at: position };
        this.marks.set(part, entry);
      }
      if (entry.at[0] !== position[0] || entry.at[1] !== position[1]) {
        entry.mark.shift([position[0] - entry.at[0], position[1] - entry.at[1], 0]);
        entry.at = position;
      }
      if (entry.mark.opacity !== opacity) entry.mark.opacity = opacity;
    }
  }

  clear(): void {
    for (const part of [...this.marks.keys()]) this.drop(part);
  }

  private drop(part: string): void {
    const entry = this.marks.get(part);
    if (!entry) return;
    this.board.remove(entry.mark);
    entry.mark.dispose();
    this.marks.delete(part);
  }
}
