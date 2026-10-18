/**
 * Repères de synchronisation dans la phrase de Nesa.
 *
 * Le modèle écrit « Le sommet {S} est au point 2, 3 » : le repère {S} indique
 * que l'objet S doit apparaître au moment où ce mot est prononcé (contiguïté
 * temporelle : l'image arrive avec la parole, ni avant ni après). On retire
 * les repères du texte dit et affiché, et on garde leur position relative
 * dans la phrase (0 = début, 1 = fin).
 */
const CUE = /\s*\{([A-Za-z][\w-]{0,31})\}/g;

export interface CuedText {
  say: string;
  /** Position relative de chaque repère dans la phrase nettoyée. */
  cues: Record<string, number>;
}

export function extractCues(raw: string): CuedText {
  const cues: Record<string, number> = {};
  const positions: Array<[string, number]> = [];
  let say = "";
  let last = 0;
  for (const match of raw.matchAll(CUE)) {
    say += raw.slice(last, match.index);
    positions.push([match[1]!, say.length]);
    last = match.index! + match[0].length;
  }
  say += raw.slice(last);
  say = say.replace(/\s{2,}/g, " ").trim();
  const length = Math.max(1, say.length);
  for (const [id, at] of positions) if (!(id in cues)) cues[id] = Math.min(1, at / length);
  return { say, cues };
}
