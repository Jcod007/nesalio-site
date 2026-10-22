/**
 * Le moteur pédagogique : à chaque tour, la PHASE de la séance, décidée par le
 * code et non par le modèle. Le modèle écrit toujours les mots, les exemples
 * et les dessins ; la phase lui dit seulement quoi faire ce tour-ci.
 *
 * Fondé sur la recherche en apprentissage :
 * - un débutant apprend mieux d'un exemple résolu que d'un problème cherché
 *   seul (worked example effect, Sweller) ; l'aide se retire peu à peu
 *   (fading), car elle gêne celui qui sait déjà (expertise reversal, Kalyuga) ;
 * - montrer, faire ensemble, puis faire seul, en vérifiant souvent et en visant
 *   environ 80 % de réussite (Rosenshine) ;
 * - faire expliquer les étapes (« pourquoi ? ») construit la compréhension ;
 * - des indices gradués, jamais la réponse finale : un tuteur qui donne les
 *   réponses fait baisser les résultats à l'examen (Bastani et al., 2025).
 *
 * Le calcul est pur et rejouable : la phase se déduit de la question de départ
 * et de la suite des réponses de l'élève (justes, fausses ou sans verdict).
 */
import type { TutorRequest } from "./request";

/**
 * - situer : l'élève arrive avec son exercice ; on lui demande par où il commencerait.
 * - montrer : un exemple résolu par Nesa, chaque étape justifiée (en deux tours au plus).
 * - guider : un exemple semblable que l'élève complète, avec de l'aide.
 * - pratiquer : l'élève fait seul (son exercice ou un nouveau), avec des indices gradués.
 * - conclure : bilan et fin de séance.
 */
export type Phase = "situer" | "montrer" | "guider" | "pratiquer" | "conclure";

/** Découverte : l'élève veut comprendre une notion. Exercice : il bloque sur un problème précis. */
export type Entry = "decouverte" | "exercice";

export interface PedagogyState {
  entry: Entry;
  phase: Phase;
  /** montrer : 1 = début de l'exemple, 2 = fin de l'exemple. */
  part: 1 | 2;
  /** Exemples résolus montrés depuis le début de la séance. */
  examples: number;
  /** pratiquer : niveau d'indice (0 = aucun, 1 = coup de pouce, 2 = indice précis, 3 = étape montrée). */
  hint: 0 | 1 | 2 | 3;
  /** Réponses fausses d'affilée. */
  wrongStreak: number;
  /** Réponses justes en pratique autonome. */
  practiceSolved: number;
  /** Réponses de l'élève depuis le début de la séance. */
  answered: number;
  /** Ce qui a fait changer de phase au dernier tour (rendu au modèle). */
  because?: string;
}

/** Au-delà, la séance se conclut : mieux vaut une séance courte réussie qu'une longue qui épuise. */
export const MAX_ANSWERS = 7;
/** Deux erreurs d'affilée : on arrête de questionner et on remontre avec un autre exemple. */
export const WRONG_STREAK_LIMIT = 2;

const DISCOVERY = /(c['’]est quoi|qu['’]est[- ]ce (que|qu)|ç?a veut dire|ca veut dire|[àa] quoi (ç?a |ca )?sert|pourquoi|explique|définition|definition|diff[ée]rence entre|ç?a fait quoi|ca fait quoi|r[ôo]le d|comment ç?a marche|comment ca marche)/i;
const EXERCISE_VERB = /\b(factoris|résou|resou|simplifi|calcul|trouve|divis|développ|develop|isole|détermine|determine|exercice|numéro|numero|problème|probleme|je bloque|j'arrive pas|j’arrive pas)/i;
/** Une expression à traiter : un nombre et une inconnue, ou un signe d'égalité, ou des crochets de partie entière. */
const EXPRESSION = /(\d[a-z]|[a-z]\s*[²³^]|\b[a-z]\(|=|\[[^\]]*x)/i;

/** Découverte ou exercice, d'après la question de l'élève. */
export function entryFor(question: string): Entry {
  if (DISCOVERY.test(question)) return "decouverte";
  // Un problème précis : une expression à traiter, ou un verbe d'exercice avec des nombres (situation-problème).
  if (EXPRESSION.test(question) || (EXERCISE_VERB.test(question) && /\d/.test(question))) return "exercice";
  return "decouverte";
}

export function initialState(question: string): PedagogyState {
  const entry = entryFor(question);
  return entry === "decouverte"
    ? { entry, phase: "montrer", part: 1, examples: 1, hint: 0, wrongStreak: 0, practiceSolved: 0, answered: 0 }
    : { entry, phase: "situer", part: 1, examples: 0, hint: 0, wrongStreak: 0, practiceSolved: 0, answered: 0 };
}

/** Une nouvelle démonstration par un exemple résolu (après des erreurs répétées). */
function showAgain(state: PedagogyState, because: string): PedagogyState {
  return { ...state, phase: "montrer", part: 1, examples: state.examples + 1, hint: 0, wrongStreak: 0, because };
}

/** La phase après une réponse de l'élève : juste (true), fausse (false) ou sans verdict (null). */
export function nextState(state: PedagogyState, correct: boolean | null): PedagogyState {
  const answered = state.answered + 1;
  const s: PedagogyState = { ...state, answered, because: undefined };
  if (answered >= MAX_ANSWERS && state.phase !== "conclure") return { ...s, phase: "conclure", because: "séance assez longue" };
  if (correct === null) {
    // Réponse libre ou question pour situer : le modèle juge lui-même ; on avance d'un cran dans l'exemple.
    return state.phase === "montrer" && state.part === 1 ? { ...s, part: 2 } : s;
  }
  const wrongStreak = correct ? 0 : state.wrongStreak + 1;
  switch (state.phase) {
    case "situer":
      // Il sait par où commencer : il fait seul, avec indices au besoin. Sinon : un exemple semblable, résolu.
      return correct
        ? { ...s, phase: "pratiquer", hint: 0, wrongStreak, because: "il sait par où commencer" }
        : { ...s, phase: "montrer", part: 1, examples: state.examples + 1, wrongStreak: 0, because: "il ne sait pas par où commencer" };
    case "montrer":
      if (state.part === 1) return { ...s, part: 2, wrongStreak };
      if (correct) return { ...s, phase: "guider", wrongStreak, because: "il a compris l'exemple" };
      return wrongStreak >= WRONG_STREAK_LIMIT ? showAgain(s, "deux erreurs d'affilée sur l'exemple") : { ...s, wrongStreak };
    case "guider":
      if (correct) return { ...s, phase: "pratiquer", hint: 0, wrongStreak, because: "il a complété l'exemple" };
      return wrongStreak >= WRONG_STREAK_LIMIT ? showAgain(s, "deux erreurs d'affilée en faisant ensemble") : { ...s, wrongStreak };
    case "pratiquer": {
      if (correct) {
        const practiceSolved = state.practiceSolved + 1;
        // Découverte : un exercice réussi seul suffit. Exercice de l'élève : il peut compter plusieurs étapes.
        const done = state.entry === "decouverte" || practiceSolved >= 3;
        return done
          ? { ...s, phase: "conclure", practiceSolved, wrongStreak, because: "il a réussi seul" }
          : { ...s, practiceSolved, hint: 0, wrongStreak };
      }
      if (wrongStreak >= WRONG_STREAK_LIMIT) return showAgain(s, "deux erreurs d'affilée seul");
      return { ...s, hint: Math.min(3, state.hint + 1) as PedagogyState["hint"], wrongStreak };
    }
    case "conclure":
      return s;
  }
}

/** Rejoue la séance : la phase du tour à venir. */
export function stateFor(question: string, answers: ReadonlyArray<{ correct: boolean | null }>): PedagogyState {
  return answers.reduce((state, answer) => nextState(state, answer.correct), initialState(question));
}

/** La phase du tour que demande cette requête (aucune pour une interruption : on répond à la question). */
export function pedagogyFor(request: TutorRequest): PedagogyState | null {
  if (request.mode === "followUp") return null;
  if (request.mode === "question" || !request.context) return initialState(request.question);
  const history = [...(request.context.answers ?? []), ...(request.answer ? [request.answer] : [])];
  return stateFor(request.context.originalQuestion ?? request.question, history);
}

const HINTS = [
  "",
  "INDICE 1 (coup de pouce) : rappelle-lui une question à se poser ou l'outil à utiliser, sans faire l'étape.",
  "INDICE 2 (indice précis) : montre au tableau ce qu'il faut regarder (highlight) et donne la première moitié de l'étape.",
  "INDICE 3 (étape montrée) : fais l'étape qui bloque, en la justifiant, puis demande-lui la SUIVANTE.",
] as const;

/** La consigne de la phase, donnée au modèle pour ce tour. */
export function phaseInstruction(state: PedagogyState): string {
  const why = state.because ? ` (décidé par le moteur : ${state.because})` : "";
  switch (state.phase) {
    case "situer":
      return [
        `PHASE : SITUER${why}. L'élève arrive avec SON exercice.`,
        "- Ne le résous pas. Écris-le au tableau, puis demande-lui par où il commencerait : quelle méthode, quelle première étape.",
        "- Ta question (\"check\") propose des méthodes ou premières étapes plausibles, avec \"answer\" et \"why\".",
      ].join("\n");
    case "montrer":
      return [
        state.part === 1
          ? `PHASE : MONTRER, début${why}. ${
              state.examples > 1
                ? "Prends un AUTRE exemple que les précédents, plus simple, sans répéter tes phrases."
                : state.entry === "exercice"
                  ? "Montre un exemple SEMBLABLE à son exercice, mais PAS son exercice : il le fera lui-même ensuite."
                  : "L'élève découvre la notion : c'est toi qui fais, il regarde."
            }`
          : `PHASE : MONTRER, fin${why}. Termine l'exemple commencé (ou réexplique autrement l'étape qu'il n'a pas comprise).`,
        "- Un EXEMPLE RÉSOLU au tableau, avec de petits nombres, étape par étape : chaque étape écrite ET justifiée à voix haute (« on met en évidence x parce que… »).",
        state.part === 1 ? "- Ce tour : l'idée en une phrase, l'énoncé de l'exemple, puis ses premières étapes." : "- Ce tour : les étapes qui restent, jusqu'au résultat, puis la vérification.",
        "- Pas de question de prédiction ni d'exercice : l'élève n'a pas encore les outils.",
        "- Termine par une question « POURQUOI » sur une étape que tu viens de montrer (« pourquoi a-t-on cherché un produit de −24 ? »), avec \"answer\" et \"why\" : elle fait expliquer, elle ne fait pas deviner.",
      ].join("\n");
    case "guider":
      return [
        `PHASE : GUIDER${why}. On fait ENSEMBLE.`,
        state.wrongStreak > 0
          ? "- Il vient de se tromper : reste sur le MÊME exemple. Montre au tableau ce qui cloche dans sa réponse, en une ou deux étapes, puis redemande l'étape autrement."
          : "- Un exemple SEMBLABLE à celui montré (mêmes étapes, autres nombres). Fais toi-même les étapes faciles, au tableau.",
        "- Laisse-lui UNE étape à compléter : ta question demande cette étape précise, choix tirés des erreurs typiques.",
      ]
        .filter(Boolean)
        .join("\n");
    case "pratiquer":
      return [
        `PHASE : PRATIQUER${why}. L'élève fait SEUL.`,
        state.hint > 0 || state.practiceSolved > 0
          ? "- Reste sur le MÊME exercice. Ne donne JAMAIS la réponse finale : il fait chaque étape."
          : state.entry === "exercice"
            ? "- Reviens à SON exercice (celui de sa question). Ne donne JAMAIS la réponse finale : il fait chaque étape."
            : "- Donne-lui un exercice semblable, un peu différent (pas une copie de l'exemple). Ne donne JAMAIS la réponse finale.",
        "- Ta question demande la prochaine étape ou le résultat de l'étape en cours.",
        state.hint > 0 ? `- ${HINTS[state.hint]}` : "- Pas d'indice tant qu'il ne s'est pas trompé : laisse-le chercher.",
      ].join("\n");
    case "conclure":
      return [
        `PHASE : CONCLURE${why}.`,
        "- Une courte remédiation si sa dernière réponse était fausse, puis une phrase qui résume l'idée centrale.",
        "- Puis {\"kind\":\"end\"} avec \"summary\" et \"noticed\" ; pas de nouvelle question.",
      ].join("\n");
  }
}

/** Libellé court, pour les rapports et les séances enregistrées. */
export function phaseLabel(state: PedagogyState): string {
  const detail = state.phase === "montrer" ? ` ${state.part}/2` : state.phase === "pratiquer" && state.hint > 0 ? ` indice ${state.hint}` : "";
  return `${state.phase}${detail}`;
}
