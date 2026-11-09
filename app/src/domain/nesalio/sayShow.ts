import type { Slice } from "./contract";
import type { CoherenceAlert } from "./coherence";

/**
 * Gestures that change nothing the student can see (backlog M12): a parameter
 * animated while no object reads it, a formula written again while it is on the
 * board, a highlight on an object faded out.
 */
export interface BoardMemory {
  /** Objects written, shown or drawn and still on the board. */
  readonly onBoard: ReadonlySet<string>;
  /** Objects faded out (or removed) and not brought back. */
  readonly hidden: ReadonlySet<string>;
  /** Symbols read by a declared object: curves, computed formulas, triangles. */
  readonly readSymbols: ReadonlySet<string>;
}

export const emptyBoardMemory: BoardMemory = { onBoard: new Set(), hidden: new Set(), readSymbols: new Set() };

const names = (source: string) => source.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? [];

/** Symbols an object reads: those of its expressions, or of the expression its computed content shows. */
function symbolsRead(item: Slice["introduces"][number], expressions: Readonly<Record<string, string>>): string[] {
  switch (item.type) {
    case "function_graph": return names(item.params.expression);
    case "parametric_curve": return [...names(item.params.x), ...names(item.params.y)];
    case "triangle_right": return [item.params.leg_a, item.params.leg_b]
      .flatMap((leg) => typeof leg === "number" ? [] : ["symbol" in leg ? leg.symbol : leg.parameter]);
    case "math": return typeof item.content === "string" ? [] : names(expressions[item.content.expression_ref] ?? "");
    default: return [];
  }
}

export function checkSayShow(
  slices: readonly Slice[], expressions: Readonly<Record<string, string>>, before: BoardMemory,
): { alerts: CoherenceAlert[]; memory: BoardMemory } {
  const alerts: CoherenceAlert[] = [];
  const onBoard = new Set(before.onBoard);
  const hidden = new Set(before.hidden);
  const readSymbols = new Set(before.readSymbols);
  slices.forEach((slice) => {
    for (const item of slice.introduces) for (const name of symbolsRead(item, expressions)) readSymbols.add(name);
  });
  slices.forEach((slice, s) => slice.beats.forEach((beat, b) => beat.do.forEach((action, a) => {
    const path = ["slices", s, "beats", b, "do", a];
    switch (action.verb) {
      case "animate_parameter":
        if (!readSymbols.has(action.parameter)) {
          alerts.push({
            rule: "unused_parameter", outcome: "refused", path: [...path, "parameter"], object: action.parameter,
            message: `Animer « ${action.parameter} » ne fait rien bouger : aucune courbe ni formule ne l'utilise. Écris « ${action.parameter} » dans l'expression de l'objet qui doit bouger (par exemple la sécante), ou retire ce geste.`,
          });
        }
        break;
      case "write":
        if (action.part === undefined) {
          if (onBoard.has(action.target)) {
            alerts.push({
              rule: "repeated_write", outcome: "noted", path, object: action.target,
              message: `« ${action.target} » est déjà écrite au tableau : la réécrire ne montre rien de nouveau. Pour écrire un nouveau calcul, déclare une nouvelle formule.`,
            });
          }
          onBoard.add(action.target);
          hidden.delete(action.target);
        }
        break;
      case "show":
      case "draw":
        onBoard.add(action.target);
        hidden.delete(action.target);
        break;
      case "fade_out":
      case "remove":
        onBoard.delete(action.target);
        hidden.add(action.target);
        break;
      case "transform":
        onBoard.delete(action.source);
        onBoard.add(action.target);
        break;
      case "highlight":
        if (hidden.has(action.target)) {
          alerts.push({
            rule: "highlight_hidden", outcome: "noted", path, object: action.target,
            message: `« ${action.target} » a été effacée : la surligner ne se voit pas. Ramène-la avec show avant de la surligner.`,
          });
        }
        break;
      default:
        break;
    }
  })));
  return { alerts, memory: { onBoard, hidden, readSymbols } };
}
