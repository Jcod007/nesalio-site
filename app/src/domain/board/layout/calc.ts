/**
 * La pile de calculs : les lignes de calcul se rangent en colonne à droite de
 * la figure ; quand la colonne est pleine, les anciennes lignes remontent et
 * s'effacent.
 */
import { isVisible, moveNodes, updateNodes, visibleNodes, type BoardState, type Reveal, type Vec2 } from "../state";
import { intersects } from "./boxes";
import { FONT_SIZE, HEIGHT_PER_POINT, scales, textExtent, type Box } from "./measure";
import { figureBox, nodeBox } from "./nodeBoxes";

/** Marge entre la figure et la pile de calculs (unités du monde). */
const CALC_MARGIN = 0.7;
const CALC_LINE_SPACING = 1.5;

/* ----------------------------- pile de calculs ----------------------------- */

interface CalcColumn {
  /** Bord gauche des lignes. */
  x: number;
  /** Milieu de la première ligne. */
  top: number;
  spacing: number;
  capacity: number;
}

/** La colonne de calculs, écrite sur le tableau à droite de la figure. */
export function calcColumn(state: BoardState): CalcColumn {
  const s = scales(state.frame);
  const figure = figureBox(state);
  const lineHeight = (FONT_SIZE.calc * HEIGHT_PER_POINT) / s.y;
  const spacing = lineHeight * CALC_LINE_SPACING;
  const height = figure.y1 - figure.y0;
  return {
    x: figure.x1 + CALC_MARGIN / s.x,
    top: figure.y1 - lineHeight / 2,
    spacing,
    capacity: Math.max(4, Math.min(9, Math.floor(height / spacing))),
  };
}

/**
 * Positions (bord gauche, milieu) des lignes de la pile, de haut en bas. Une
 * ligne ne s'écrit jamais sur un texte posé dans la figure ou sur un point :
 * elle descend d'un cran tant que la place est prise.
 */
export function calcFlow(state: BoardState, texts: readonly string[]): Vec2[] {
  const column = calcColumn(state);
  const calc = new Set(state.calc);
  const taken = visibleNodes(state)
    .filter((node) => (node.type === "text" && !calc.has(node.id)) || node.type === "point" || (node.type === "polygon" && node.fill))
    .map((node) => nodeBox(node, state.frame));
  const positions: Vec2[] = [];
  let y = column.top;
  for (const text of texts) {
    const extent = textExtent(text, FONT_SIZE.calc, state.frame);
    const lineAt = (cy: number): Box => ({ x0: column.x, x1: column.x + extent.w, y0: cy - extent.h / 2, y1: cy + extent.h / 2 });
    for (let guard = 0; guard < 20 && taken.some((box) => intersects(box, lineAt(y))); guard++) y -= column.spacing;
    positions.push([column.x, y]);
    y -= column.spacing;
  }
  return positions;
}

/** Texte des lignes de la pile, dans l'ordre. */
function calcTexts(state: BoardState): string[] {
  return state.calc.map((id) => {
    const node = state.nodes[id];
    return node?.type === "text" ? node.text : "";
  });
}

/** Où écrire une nouvelle ligne de calcul (sous les autres, sans recouvrir la figure). */
export function nextCalcSlot(state: BoardState, text: string): Vec2 {
  return calcFlow(state, [...calcTexts(state), text]).at(-1)!;
}

/**
 * Remet chaque ligne de la pile à sa place (après un ajout, un effacement ou
 * un changement de repère), en animant celles qui bougent.
 */
export function reflowCalc(state: BoardState, reveal: Reveal): BoardState {
  let next = state;
  const slots = calcFlow(state, calcTexts(state));
  state.calc.forEach((id, index) => {
    const node = next.nodes[id];
    if (!isVisible(node) || node.type !== "text") return;
    const [sx, sy] = slots[index]!;
    const current: Vec2 = [node.at[0] + node.offset[0], node.at[1] + node.offset[1]];
    const delta: Vec2 = [sx - current[0], sy - current[1]];
    if (Math.abs(delta[0]) > 1e-9 || Math.abs(delta[1]) > 1e-9) next = moveNodes(next, [id], delta, reveal);
  });
  return next;
}

/** Fait de la place dans la pile pleine : la plus ancienne ligne s'efface, les autres remontent. */
export function makeRoomInCalc(state: BoardState, reveal: Reveal): BoardState {
  const { capacity } = calcColumn(state);
  if (state.calc.length < capacity) return state;
  const drop = state.calc.slice(0, state.calc.length - capacity + 1);
  let next = updateNodes(state, drop, (node) => ({ ...node, erased: reveal }));
  next = { ...next, calc: state.calc.filter((id) => !drop.includes(id)) };
  return reflowCalc(next, reveal);
}
