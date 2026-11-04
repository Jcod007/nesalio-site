/**
 * Graduations chiffrées des axes : pas lisible, valeurs et place des chiffres.
 */
import { formatNumber, niceStep } from "../geometry";
import type { Frame, Vec2 } from "../state";
import { mathSize, scales, type Extent } from "./measure";

/** Taille des chiffres des graduations (police du texte courant, pas la manuscrite). */
export const TICK_FONT = 20;
const TICK_HEIGHT = 0.25;
const TICK_WIDTH_PER_CHAR = 0.11;

export interface AxisTicks {
  step: number;
  values: number[];
}

/** Graduations chiffrées du repère (le rendu dessine exactement celles-ci). */
export function axisTicks(frame: Frame): { x: AxisTicks; y: AxisTicks; origin: Vec2 } {
  const s = scales(frame);
  const along = ([a, b]: [number, number], step: number): number[] => {
    const out: number[] = [];
    for (let v = Math.ceil(a / step - 1e-9) * step; v <= b - step * 0.5; v += step) {
      const rounded = Number((Math.round(v / step) * step).toPrecision(12));
      if (Math.abs(rounded) > 1e-9) out.push(rounded);
    }
    return out;
  };
  /**
   * Pas lisible : le pas demandé (ou un pas rond), élargi tant que deux chiffres
   * voisins se toucheraient. Sur l'axe des x, la largeur du plus long chiffre
   * plus un blanc ; sur l'axe des y, la hauteur d'un chiffre plus un blanc.
   */
  const readable = (range: [number, number], unit: number, requested: number | undefined, target: number, room: (step: number) => number) => {
    const span = range[1] - range[0];
    let step = requested && requested > 0 ? requested : niceStep(span, target);
    // Pas plus de 60 graduations, quel que soit le pas demandé.
    while (span / step > 60) step = nextStep(step, requested);
    for (let guard = 0; guard < 40 && step * unit < room(step); guard++) step = nextStep(step, requested);
    return step;
  };
  const widest = (range: [number, number], step: number) =>
    Math.max(1, ...along(range, step).map((v) => Array.from(tickText(v)).length)) * TICK_WIDTH_PER_CHAR;
  const xStep = readable(frame.x, s.x, frame.xStep, 8, (step) => widest(frame.x, step) + 0.12);
  const yStep = readable(frame.y, s.y, frame.yStep, 7, () => TICK_HEIGHT + 0.16);
  return {
    x: { step: xStep, values: along(frame.x, xStep) },
    y: { step: yStep, values: along(frame.y, yStep) },
    origin: [clamp(0, frame.x), clamp(0, frame.y)],
  };
}

/**
 * Pas suivant, plus large : un multiple du pas demandé (10 → 20 → 50 → 100…),
 * sinon le pas rond suivant (1, 2, 5 × 10ⁿ).
 */
function nextStep(step: number, requested: number | undefined): number {
  if (requested && requested > 0) {
    const k = step / requested;
    const power = 10 ** Math.floor(Math.log10(k) + 1e-9);
    const unit = k / power;
    const next = unit < 1.5 ? 2 : unit < 3.5 ? 5 : 10;
    return requested * next * power;
  }
  return niceStep(step * 1.5, 1);
}

/** Chiffre d'une graduation, à la québécoise : virgule décimale, espace entre les milliers (25 000). */
export function tickText(value: number): string {
  const text = formatNumber(value);
  const [whole, decimals] = text.split(",");
  const sign = whole!.startsWith("-") ? "-" : "";
  const digits = whole!.replace("-", "");
  const grouped = digits.length > 4 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : digits;
  return sign + grouped + (decimals ? `,${decimals}` : "");
}

/** Centre et taille (coordonnées mathématiques) de chaque chiffre des graduations. */
export function tickLabels(frame: Frame): Array<{ axis: "x" | "y"; value: number; text: string; at: Vec2; size: Extent }> {
  const { x, y, origin } = axisTicks(frame);
  const s = scales(frame);
  const size = (text: string) => mathSize(frame, Array.from(text).length * TICK_WIDTH_PER_CHAR, TICK_HEIGHT);
  return [
    ...x.values.map((v) => ({ axis: "x" as const, value: v, text: tickText(v), at: [v, origin[1] - 0.28 / s.y] as Vec2, size: size(tickText(v)) })),
    // Chiffres de l'axe des y alignés à droite, à distance fixe de l'axe (« 45 000 » ne mord pas sur l'axe).
    ...y.values.map((v) => {
      const extent = size(tickText(v));
      return { axis: "y" as const, value: v, text: tickText(v), at: [origin[0] - 0.18 / s.x - extent.w / 2, v] as Vec2, size: extent };
    }),
  ];
}

const clamp = (v: number, [a, b]: [number, number]) => (v < a ? a : v > b ? b : v);
