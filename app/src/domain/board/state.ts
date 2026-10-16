/**
 * État du tableau : une fonction pure (état, commande, horaire) → nouvel état.
 *
 * Chaque objet porte son horaire d'apparition (`reveal`) exprimé sur l'horloge
 * du lecteur. Le moteur applique toutes les commandes d'une étape d'un coup,
 * avec des heures de début échelonnées ; le rendu (manim-web) lance ensuite
 * chaque animation à son heure. L'état reste simple, sérialisable et testable.
 */
import type { Action, DrawableAction } from "@/domain/scene/schema";

export interface Reveal {
  /** Heure de début, en millisecondes sur l'horloge du lecteur. */
  start: number;
  duration: number;
}

export interface Frame {
  x: [number, number];
  y: [number, number];
  xLabel?: string;
  yLabel?: string;
}

/** Cadre utilisé tant que le modèle n'a pas tracé d'axes. */
export const DEFAULT_FRAME: Frame = { x: [-6, 6], y: [-4, 4] };

export type BoardItem = DrawableAction & { reveal: Reveal; erased?: Reveal };

export interface AxesItem {
  frame: Frame;
  reveal: Reveal;
}

export interface NoteItem {
  id: string;
  text: string;
  reveal: Reveal;
}

export interface TagItem {
  text: string;
  tone: "warn" | "ok" | "info";
  reveal: Reveal;
}

export type CameraTarget =
  | { kind: "fit"; x: [number, number]; y: [number, number]; at: number; duration: number }
  | { kind: "reset"; at: number; duration: number };

export interface BoardState {
  frame: Frame;
  axes: AxesItem | null;
  items: Readonly<Record<string, BoardItem>>;
  /** Ordre de dessin (les derniers par-dessus). */
  order: readonly string[];
  notes: readonly NoteItem[];
  tag: TagItem | null;
  /** Heure de début de la dernière mise en évidence de chaque objet. */
  highlights: Readonly<Record<string, number>>;
  camera: CameraTarget | null;
}

export const MAX_NOTES = 8;

export function emptyBoard(): BoardState {
  return {
    frame: DEFAULT_FRAME,
    axes: null,
    items: {},
    order: [],
    notes: [],
    tag: null,
    highlights: {},
    camera: null,
  };
}

export function applyAction(state: BoardState, action: Action, reveal: Reveal): BoardState {
  switch (action.type) {
    case "axes": {
      const frame: Frame = { x: action.x, y: action.y, xLabel: action.xLabel, yLabel: action.yLabel };
      return { ...state, frame, axes: { frame, reveal } };
    }
    case "curve":
    case "point":
    case "vector":
    case "segment":
    case "text": {
      const exists = action.id in state.items;
      return {
        ...state,
        items: { ...state.items, [action.id]: { ...action, reveal } },
        order: exists ? state.order : [...state.order, action.id],
      };
    }
    case "note": {
      const id = action.id ?? `note${state.notes.length + 1}`;
      const notes = [...state.notes.filter((n) => n.id !== id), { id, text: action.text, reveal }];
      return { ...state, notes: notes.slice(-MAX_NOTES) };
    }
    case "tag":
      return { ...state, tag: { text: action.text, tone: action.tone ?? "warn", reveal } };
    case "highlight": {
      const known = action.target in state.items || state.notes.some((n) => n.id === action.target);
      if (!known) return state;
      return { ...state, highlights: { ...state.highlights, [action.target]: reveal.start } };
    }
    case "erase": {
      const item = state.items[action.target];
      if (item) return { ...state, items: { ...state.items, [action.target]: { ...item, erased: reveal } } };
      if (state.notes.some((n) => n.id === action.target)) {
        return { ...state, notes: state.notes.filter((n) => n.id !== action.target) };
      }
      return state;
    }
    case "focus":
      return { ...state, camera: { kind: "fit", x: action.x, y: action.y, at: reveal.start, duration: reveal.duration } };
    case "resetView":
      return { ...state, camera: { kind: "reset", at: reveal.start, duration: reveal.duration } };
  }
}

/** Retire définitivement les objets effacés dont l'animation de sortie est terminée. */
export function pruneErased(state: BoardState, now: number): BoardState {
  const gone = state.order.filter((id) => {
    const erased = state.items[id]?.erased;
    return erased !== undefined && now >= erased.start + erased.duration;
  });
  if (gone.length === 0) return state;
  const items = { ...state.items };
  for (const id of gone) delete items[id];
  return { ...state, items, order: state.order.filter((id) => !gone.includes(id)) };
}

/** Description courte d'un objet, envoyée au modèle quand l'élève l'interrompt. */
export interface BoardSummaryItem {
  id: string;
  type: string;
  detail: string;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
const pt = ([x, y]: [number, number]) => `(${fmt(x)}, ${fmt(y)})`;

export function summarizeBoard(state: BoardState): BoardSummaryItem[] {
  const out: BoardSummaryItem[] = [];
  if (state.axes) {
    const { x, y } = state.axes.frame;
    out.push({ id: "axes", type: "axes", detail: `x de ${fmt(x[0])} à ${fmt(x[1])}, y de ${fmt(y[0])} à ${fmt(y[1])}` });
  }
  for (const id of state.order) {
    const item = state.items[id];
    if (!item || item.erased) continue;
    out.push({ id, type: item.type, detail: describeItem(item) });
  }
  for (const note of state.notes) out.push({ id: note.id, type: "note", detail: note.text });
  return out;
}

function describeItem(item: DrawableAction): string {
  switch (item.type) {
    case "curve":
      return `y = ${item.fn}${item.label ? ` (« ${item.label} »)` : ""}`;
    case "point":
      return `${pt(item.at)}${item.label ? ` « ${item.label} »` : ""}`;
    case "vector":
    case "segment":
      return `de ${pt(item.from)} à ${pt(item.to)}${item.label ? ` « ${item.label} »` : ""}`;
    case "text":
      return `« ${item.text} » en ${pt(item.at)}`;
  }
}

