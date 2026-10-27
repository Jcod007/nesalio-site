/**
 * Relecture d'un tour : ce que Nesa a dit et fait, comparé à ce qui est au
 * tableau. Le résultat sert deux fois :
 * - au tour suivant, il est rendu au modèle (« au tour précédent, tu as dit
 *   que la courbe s'étire sans la transformer ») : le modèle se corrige, sans
 *   coût de latence ;
 * - dans le diagnostic, il mesure la qualité visuelle d'une séance.
 *
 * Tout est déterministe et général : aucune règle propre à une notion.
 */
import { resolveTargets, type BoardState } from "@/domain/board/state";
import type { Step } from "@/domain/scene/schema";

/** Commandes qui montrent un changement sous les yeux de l'élève. */
export const GESTURE_COMMANDS: ReadonlySet<string> = new Set(["move", "copy", "rotate", "transform", "applyMatrix"]);
/** Commandes qui rendent visible une quantité dont on parle (une aire, un parcours). */
const SHOWING_COMMANDS: ReadonlySet<string> = new Set([...GESTURE_COMMANDS, "area", "parametric", "highlight"]);

/**
 * Mots qui annoncent une action visible. Si la phrase en contient un et que
 * l'étape ne montre rien, Nesa « dit sans montrer ».
 */
const ACTION_WORDS = [
  "glisse",
  "glisser",
  "tourne",
  "tourner",
  "pivote",
  "oscille",
  "osciller",
  "déforme",
  "déformer",
  "étire",
  "étirer",
  "écrase",
  "rétrécit",
  "retourne",
  "enroule",
  "s'enroule",
  "s'annulent",
  "déplace",
  "déplacer",
  "penche",
];

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const FOLDED_WORDS = ACTION_WORDS.map(fold);

function actionWord(say: string): string | undefined {
  const words = fold(say).split(/[^\p{L}']+/u);
  const index = FOLDED_WORDS.findIndex((w) => words.includes(w));
  return index >= 0 ? ACTION_WORDS[index] : undefined;
}

export interface TurnReview {
  steps: number;
  /** Objets qui bougent ou se transforment pendant le tour. */
  gestures: number;
  /** Cibles qui n'existent pas au tableau (« highlight a » alors que a n'a jamais été dessiné). */
  missingTargets: string[];
  /** Phrases qui annoncent une action sans rien montrer, avec le mot en cause. */
  unshown: Array<{ say: string; word: string }>;
  /** Phrases de plus de 22 mots (une idée par phrase). */
  longSentences: number;
}

/** Relit les étapes d'un tour ; `board` est l'état du tableau à la fin du tour. */
export function reviewTurn(steps: readonly Step[], board: BoardState): TurnReview {
  let gestures = 0;
  const missing = new Set<string>();
  const unshown: TurnReview["unshown"] = [];
  let longSentences = 0;
  let previousShowed = false;
  for (const step of steps) {
    const types = (step.do ?? []).map((a) => a.type);
    const shows = types.some((t) => SHOWING_COMMANDS.has(t));
    // Seul un vrai geste (ou une aire, un parcours) couvre la phrase suivante ; une mise en évidence, non.
    const changes = types.some((t) => SHOWING_COMMANDS.has(t) && t !== "highlight");
    gestures += types.filter((t) => GESTURE_COMMANDS.has(t)).length;
    for (const action of step.do ?? []) {
      if ("target" in action && typeof action.target === "string" && !(action.target in board.nodes) && resolveTargets(board, action.target).length === 0) {
        missing.add(action.target);
      }
    }
    // Une phrase qui commente le geste de l'étape précédente (« tu vois, il s'est étiré ») est couverte.
    const word = actionWord(step.say);
    if (word && !shows && !previousShowed) unshown.push({ say: step.say.slice(0, 120), word });
    previousShowed = changes;
    if (step.say.trim().split(/\s+/).length > 22) longSentences++;
  }
  return { steps: steps.length, gestures, missingTargets: [...missing], unshown, longSentences };
}

/** Le retour donné au modèle au début du tour suivant (vide si le tour était propre). */
export function reviewNotes(review: TurnReview, rejected: readonly string[] = []): string[] {
  const notes: string[] = [];
  for (const reason of rejected.slice(0, 2)) {
    notes.push(`Une commande a été refusée, rien ne s'est affiché : ${reason.slice(0, 150)}. Refais-la correctement.`);
  }
  for (const { say, word } of review.unshown.slice(0, 2)) {
    notes.push(`Tu as dit « ${say} » (« ${word} ») sans le montrer : fais-le au tableau (move, rotate, transform, applyMatrix, area).`);
  }
  if (review.missingTargets.length > 0) {
    notes.push(`Tu as désigné ${review.missingTargets.slice(0, 4).join(", ")}, absent(s) du tableau : dessine un objet avant d'en parler.`);
  }
  if (review.longSentences > 0) notes.push(`${review.longSentences} phrase(s) chargée(s) : découpe les idées sans supprimer les définitions ni les raisons nécessaires.`);
  return notes.slice(0, 4).map((n) => n.slice(0, 240));
}
