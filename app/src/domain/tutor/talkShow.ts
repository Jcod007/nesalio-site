/**
 * « Parle-t-elle plus qu'elle ne montre ? » : pour chaque phrase, le temps de
 * parole (estimé) et ce qui se passe au tableau pendant ce temps.
 *
 * - montre   : un objet apparaît (figure, courbe, aire…) ou bouge / se transforme ;
 * - écrit    : seulement du texte (note, texte, matrice, étiquette) ;
 * - souligne : seulement une mise en évidence, un estompage, un effacement ;
 * - rien     : le tableau ne change pas du tout.
 *
 * La question posée à l'élève compte comme de la parole (elle est dite à voix haute).
 */
import type { Step } from "@/domain/scene/schema";
import { estimateSpeechMs } from "@/domain/timeline/plan";

const DRAWS = new Set(["axes", "curve", "point", "vector", "segment", "triangle", "angle", "construct", "image", "circle", "sector", "polygon", "regularPolygon", "prism", "pyramid", "cylinder", "cone", "sphere", "incline", "area", "parametric", "grid"]);
const MOVES = new Set(["move", "copy", "rotate", "applyMatrix"]);
const WRITES = new Set(["text", "note", "matrix", "tag"]);

export type StepVisual = "montre" | "ecrit" | "souligne" | "rien";

export function stepVisual(step: Step): StepVisual {
  const actions = step.do ?? [];
  if (actions.length === 0) return "rien";
  const shows = actions.some(
    (a) => DRAWS.has(a.type) || MOVES.has(a.type) || (a.type === "transform" && (a.text === undefined || Object.keys(a).length > 3)),
  );
  if (shows) return "montre";
  if (actions.some((a) => WRITES.has(a.type) || a.type === "transform")) return "ecrit";
  return "souligne";
}

export interface TalkShowReport {
  sentences: number;
  speechMs: number;
  /** Part du temps de parole pendant laquelle le tableau montre quelque chose de nouveau. */
  shownShare: number;
  /** Temps de parole par catégorie, en ms. */
  byVisual: Record<StepVisual, number>;
  /** Plus longue suite de phrases sans rien de nouveau à voir (ni dessin ni mouvement), en ms. */
  longestBlindMs: number;
  /** Temps de parole avant le premier dessin, en ms. */
  untilFirstVisualMs: number;
}

export function talkShow(steps: readonly Step[]): TalkShowReport {
  const byVisual: Record<StepVisual, number> = { montre: 0, ecrit: 0, souligne: 0, rien: 0 };
  let longest = 0;
  let run = 0;
  let untilFirst = 0;
  let seenVisual = false;
  for (const step of steps) {
    const promptSpoken = step.check && !step.say.trim().endsWith("?") ? estimateSpeechMs(step.check.prompt) : 0;
    const ms = estimateSpeechMs(step.say) + promptSpoken;
    const visual = stepVisual(step);
    byVisual[visual] += ms;
    if (visual === "montre") {
      seenVisual = true;
      run = 0;
    } else {
      run += ms;
      longest = Math.max(longest, run);
    }
    if (!seenVisual) untilFirst += ms;
  }
  const speechMs = Object.values(byVisual).reduce((a, b) => a + b, 0);
  return {
    sentences: steps.length,
    speechMs,
    shownShare: speechMs > 0 ? byVisual.montre / speechMs : 0,
    byVisual,
    longestBlindMs: longest,
    untilFirstVisualMs: untilFirst,
  };
}
