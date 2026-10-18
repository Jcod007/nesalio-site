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

/* ------------------------- synchronisation déduite ------------------------- */

/** Mots qui désignent un type d'objet dans une phrase. */
const TYPE_WORDS: Record<string, readonly string[]> = {
  axes: ["repère", "axes", "axe", "graphique"],
  curve: ["courbe", "parabole", "fonction", "graphe", "droite"],
  point: ["point", "sommet"],
  vector: ["vecteur", "flèche", "force", "vitesse"],
  segment: ["segment", "côté", "trait", "droite", "hauteur"],
};

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Première occurrence du mot (mot entier), à partir de `from`. */
function findWord(say: string, word: string, caseSensitive: boolean, from: number): number {
  if (word.length === 0) return -1;
  const haystack = caseSensitive ? say : fold(say);
  const needle = caseSensitive ? word : fold(word);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(needle)}(?![\\p{L}\\p{N}])`, "u");
  const match = pattern.exec(haystack.slice(from));
  return match ? from + match.index : -1;
}

interface CueableAction {
  type: string;
  id?: string;
  target?: string;
  label?: string;
  text?: string;
}

/** Ce par quoi Nesa désigne probablement l'objet : son nom (« A »), son étiquette, son texte, son type. */
function wordsFor(action: CueableAction): Array<{ word: string; exact: boolean }> {
  const words: Array<{ word: string; exact: boolean }> = [];
  const name = action.id ?? action.target;
  // Un nom court (« A », « f ») se cherche tel quel ; un nom long seulement s'il est un vrai mot.
  if (name && name.length <= 2) words.push({ word: name, exact: true });
  else if (name && /^[\p{L}]{3,}$/u.test(name)) words.push({ word: name, exact: false });
  for (const part of [action.label, action.text]) {
    const first = part?.split(/[\s(),=:;]+/).find((w) => /\p{L}{3,}/u.test(w));
    if (first) words.push({ word: first, exact: false });
  }
  for (const word of TYPE_WORDS[action.type] ?? []) words.push({ word, exact: false });
  return words;
}

/**
 * Repères déduits pour les objets que le modèle n'a pas repérés lui-même :
 * on cherche dans la phrase le mot qui les désigne (« le point A », « la
 * courbe », « la montée »), en avançant dans la phrase au fil des objets.
 * Les repères écrits par le modèle ({id}) gardent la priorité.
 */
export function inferCues(say: string, actions: readonly CueableAction[], explicit: Readonly<Record<string, number>> = {}): Record<string, number> {
  const cues: Record<string, number> = { ...explicit };
  const length = Math.max(1, say.length);
  let cursor = 0;
  for (const action of actions) {
    const key = action.id ?? action.target;
    if (!key) continue;
    if (key in cues) {
      cursor = Math.max(cursor, Math.round(cues[key]! * length));
      continue;
    }
    let found = -1;
    for (const { word, exact } of wordsFor(action)) {
      found = findWord(say, word, exact, cursor);
      if (found >= 0) break;
    }
    if (found >= 0) {
      cues[key] = found / length;
      cursor = found;
    }
  }
  return cues;
}
