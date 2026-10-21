/**
 * Vérificateur géométrique : ce que Nesa AFFIRME est recalculé sur la figure.
 *
 * Séances du 21 octobre (« Démontre-moi le théorème de Thalès ») : les calculs étaient justes,
 * mais Nesa affirmait AD/AC = AE/AB sur une figure où E est sur [CB], appelait « ADE » le petit
 * triangle CDE, et écrivait des rapports que le dessin contredisait. Une erreur de ce genre ne se
 * voit pas dans l'arithmétique : il faut la figure.
 *
 * Trois sortes d'affirmations, lues dans la phrase, les lignes de calcul, les textes du tableau, la
 * question et sa bonne réponse :
 * - des rapports égaux : « AD sur AC et AE sur AB sont égaux », « CD/CA = CE/CB »,
 *   « \frac{CD}{CA} = \frac{DE}{AB} = 0,25 » (une valeur numérique de la chaîne compte aussi) ;
 * - des triangles semblables : « le triangle ADE est une réduction de ACB », « les triangles ADE et
 *   ABC ont les mêmes angles » ;
 * - des droites parallèles : « DE est parallèle à AB », « (DE) // (AB) ».
 * Chaque affirmation est recalculée avec les points du tableau, par leur nom. Une affirmation qu'on
 * ne peut pas vérifier (un point absent, une hypothèse « si D était au milieu ») est ignorée : le
 * vérificateur ne signale que ce que la figure contredit. Pur, déterministe, quelques microsecondes.
 */
import { resolvePoint } from "@/domain/scene/commands/points";
import type { Step } from "@/domain/scene/schema";
import { isVisible, type BoardState, type Vec2 } from "@/domain/board/state";

export type ClaimKind = "rapports" | "semblables" | "parallèles";
export type ClaimSource = "phrase" | "calcul" | "texte" | "question" | "réponse";

export interface ClaimIssue {
  kind: ClaimKind;
  source: ClaimSource;
  /** L'affirmation telle que lue (« AD/AC = AE/AB »). */
  claim: string;
  /** Ce que donne la figure (« AD/AC ≈ 0,5 ; AE/AB ≈ 0,63 »). */
  measured: string;
  /** Pour une ligne de calcul ou un texte : l'index de la commande dans l'étape. */
  action?: number;
}

/* ----------------------------- lecture du texte ----------------------------- */

const PRIME = "'{0,2}";
const SEG = `[A-Z]${PRIME}\\s?[A-Z]${PRIME}`;
const RATIO_LATEX = new RegExp(`\\\\d?frac\\s*\\{\\s*\\(?(${SEG})\\)?\\s*\\}\\s*\\{\\s*\\(?(${SEG})\\)?\\s*\\}`, "g");
const RATIO_SLASH = new RegExp(`(?<![\\w'])(${SEG})\\s*/\\s*(${SEG})(?![\\w'])`, "g");
const RATIO_WORDS = new RegExp(`(?<![\\w'])(${SEG})\\s+sur\\s+(${SEG})(?![\\w'])`, "g");
/** Un nombre de la chaîne : 0,25 ou \frac{1}{2} ou \frac{1{,}5}{6} (accolades de la virgule retirées avant). */
const NUMBER_FRAC = /\\d?frac\s*\{\s*(\d+(?:[.,]\d+)?)\s*\}\s*\{\s*(\d+(?:[.,]\d+)?)\s*\}/g;
const EQUAL = /=|égal|égale|égaux|égales|même rapport|le même rapport|identiques/i;
const NEGATION = /\b(pas|jamais|aucun)\b|n'est|ne sont|≠|\\neq|différent|faux|fausse|erreur|confond/i;
/** Une hypothèse ou un autre exemple : rien à vérifier sur la figure du tableau. */
const HYPOTHESIS = /^\s*(et\s+)?(si|suppose|supposons|imagine|imaginons)\b|\bsi (je|on|tu|d|e)\b|\bautre triangle\b|\bpar exemple\b|\bétait\b|\bserait\b|\bvaudrait\b/i;
const SIMILAR = /semblable|réduction|agrandissement|même forme|mêmes angles|copie réduite|homologue/i;
const PARALLEL = /parall[eè]le|\/\/|∥|\\parallel/i;

const norm = (text: string) =>
  text
    // Repères {A'} de la phrase ; pas les accolades du LaTeX (\frac{CD}{CA}), précédées d'une lettre ou de « } ».
    .replace(/(?<![\\\w}])\{([\w' ]+)\}/g, (whole, inner: string) => (/^\d/.test(inner) ? whole : inner))
    .replace(/\{,\}/g, ",")
    .replace(/[′’]/g, "'")
    .replace(/\$/g, " ");

/** Coupe en propositions : une affirmation ne traverse pas un point, un point-virgule ou « mais ». */
function clauses(text: string): string[] {
  return norm(text)
    .split(/(?<=[.;!?])\s+|\s+mais\s+|\n/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

const segName = (raw: string) => raw.replace(/\s+/g, "");
const toNumber = (raw: string) => Number(raw.replace(",", "."));

interface RatioClaim {
  ratios: Array<[string, string]>;
  numbers: number[];
  text: string;
}

function readRatios(clause: string): RatioClaim | null {
  if (!EQUAL.test(clause) || NEGATION.test(clause) || HYPOTHESIS.test(clause)) return null;
  const found: Array<{ at: number; pair: [string, string] }> = [];
  for (const re of [RATIO_LATEX, RATIO_SLASH, RATIO_WORDS]) {
    for (const m of clause.matchAll(re)) found.push({ at: m.index ?? 0, pair: [segName(m[1]!), segName(m[2]!)] });
  }
  if (found.length === 0) return null;
  const numbers: number[] = [];
  // Seulement les nombres reliés à la chaîne par « = » (pas « CD vaut 3 »).
  for (const part of clause.split("=").slice(1)) {
    const t = part.trim();
    const frac = [...t.matchAll(NUMBER_FRAC)][0];
    if (frac && frac.index === 0) numbers.push(toNumber(frac[1]!) / toNumber(frac[2]!));
    else if (/^\d+(?:[.,]\d+)?(?![\d/])/.test(t) && !/^\d+(?:[.,]\d+)?\s*[a-zA-Z×x]/.test(t)) numbers.push(toNumber(t.match(/^\d+(?:[.,]\d+)?/)![0]));
  }
  const pairs = found.sort((a, b) => a.at - b.at).map((f) => f.pair);
  if (pairs.length + numbers.length < 2) return null;
  return { ratios: pairs, numbers, text: clause };
}

const TRIANGLE = /(?<![\w'])([A-Z]'{0,2})\s?([A-Z]'{0,2})\s?([A-Z]'{0,2})(?![\w'])/g;

function readSimilar(clause: string): Array<[string[], string[]]> {
  if (!SIMILAR.test(clause) || NEGATION.test(clause) || HYPOTHESIS.test(clause)) return [];
  const names = [...clause.matchAll(TRIANGLE)].map((m) => [m[1]!, m[2]!, m[3]!]).filter((t) => new Set(t).size === 3);
  return names.length >= 2 ? [[names[0]!, names[1]!]] : [];
}

const LINE = `\\(?(${SEG})\\)?`;
const PARALLEL_PAIR = new RegExp(`${LINE}\\s*(?:(?:est|sont|reste)\\s+)?(?:parall[eè]les?\\s+(?:à|a|avec)\\s+(?:la droite |le côté |le segment )?|//\\s*|∥\\s*|\\\\parallel\\s*)${LINE}`, "i");

function readParallel(clause: string): Array<[string, string]> {
  if (!PARALLEL.test(clause) || NEGATION.test(clause) || HYPOTHESIS.test(clause)) return [];
  const m = clause.match(PARALLEL_PAIR);
  return m ? [[segName(m[1]!), segName(m[2]!)]] : [];
}

/* ----------------------------- mesure sur la figure ----------------------------- */

/** Un point par son nom : point du tableau, sommet nommé d'une figure, ou point dont l'étiquette est ce nom. */
function pointNamed(board: BoardState, name: string): Vec2 | null {
  const direct = resolvePoint(board, name);
  if (direct) return direct;
  const nodes = board.order.map((id) => board.nodes[id]).filter(isVisible).reverse();
  for (const node of nodes) {
    if (node.type === "point" && node.label?.trim() === name) return [node.at[0] + node.offset[0], node.at[1] + node.offset[1]];
  }
  return null;
}

function ends(board: BoardState, seg: string): [Vec2, Vec2] | null {
  const m = seg.match(/^([A-Z]'{0,2})([A-Z]'{0,2})$/);
  if (!m) return null;
  const p = pointNamed(board, m[1]!);
  const q = pointNamed(board, m[2]!);
  return p && q ? [p, q] : null;
}

const dist = (p: Vec2, q: Vec2) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const fmt = (x: number) => (Math.round(x * 100) / 100).toString().replace(".", ",");
/** Écart toléré : les coordonnées du modèle sont arrondies. */
const TOLERANCE = 0.04;
const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE * Math.max(Math.abs(a), Math.abs(b), 1e-9);

function checkRatios(board: BoardState, claim: RatioClaim): string | null {
  const values: Array<{ label: string; value: number }> = [];
  for (const [top, bottom] of claim.ratios) {
    const a = ends(board, top);
    const b = ends(board, bottom);
    if (!a || !b) return null;
    const den = dist(...b);
    if (den < 1e-9) return null;
    values.push({ label: `${top}/${bottom}`, value: dist(...a) / den });
  }
  for (const n of claim.numbers) values.push({ label: fmt(n), value: n });
  const ok = values.every((v) => close(v.value, values[0]!.value));
  return ok ? null : values.map((v) => (v.label.includes("/") ? `${v.label} ≈ ${fmt(v.value)}` : `annoncé ${v.label}`)).join(" ; ");
}

function angles(p: Vec2[]): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % 3]!;
    const c = p[(i + 2) % 3]!;
    const u = [b[0] - a[0], b[1] - a[1]];
    const v = [c[0] - a[0], c[1] - a[1]];
    const nu = Math.hypot(u[0]!, u[1]!);
    const nv = Math.hypot(v[0]!, v[1]!);
    if (nu < 1e-9 || nv < 1e-9) return null;
    out.push((Math.acos(Math.max(-1, Math.min(1, (u[0]! * v[0]! + u[1]! * v[1]!) / (nu * nv)))) * 180) / Math.PI);
  }
  return out;
}

function checkSimilar(board: BoardState, [t1, t2]: [string[], string[]]): string | null {
  const p1 = t1.map((n) => pointNamed(board, n));
  const p2 = t2.map((n) => pointNamed(board, n));
  if (p1.some((p) => !p) || p2.some((p) => !p)) return null;
  const a1 = angles(p1 as Vec2[]);
  const a2 = angles(p2 as Vec2[]);
  const show = (t: string[], a: number[] | null) => `${t.join("")} : ${a ? a.map((x) => Math.round(x)).join("°, ") + "°" : "points alignés"}`;
  if (!a1 || !a2) return `${show(t1, a1)} ; ${show(t2, a2)}`;
  // Semblables dans un ordre quelconque : mêmes angles, à 2° près.
  const s1 = [...a1].sort((x, y) => x - y);
  const s2 = [...a2].sort((x, y) => x - y);
  return s1.every((x, i) => Math.abs(x - s2[i]!) <= 2) ? null : `${show(t1, a1)} ; ${show(t2, a2)}`;
}

function checkParallel(board: BoardState, [l1, l2]: [string, string]): string | null {
  const a = ends(board, l1);
  const b = ends(board, l2);
  if (!a || !b) return null;
  const da = Math.atan2(a[1][1] - a[0][1], a[1][0] - a[0][0]);
  const db = Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]);
  let gap = Math.abs(((da - db) * 180) / Math.PI) % 180;
  gap = Math.min(gap, 180 - gap);
  return gap <= 1.5 ? null : `angle entre (${l1}) et (${l2}) ≈ ${Math.round(gap)}°`;
}

/* ----------------------------- vérification d'une étape ----------------------------- */

/** Les affirmations fausses d'un texte, mesurées sur `board`. */
export function verifyText(board: BoardState, text: string, source: ClaimSource, action?: number): ClaimIssue[] {
  const issues: ClaimIssue[] = [];
  const at = action === undefined ? {} : { action };
  for (const clause of clauses(text)) {
    const ratio = readRatios(clause);
    if (ratio) {
      const measured = checkRatios(board, ratio);
      if (measured) {
        const claim = [...ratio.ratios.map(([a, b]) => `${a}/${b}`), ...ratio.numbers.map(fmt)].join(" = ");
        issues.push({ kind: "rapports", source, claim, measured, ...at });
      }
    }
    for (const pair of readSimilar(clause)) {
      const measured = checkSimilar(board, pair);
      if (measured) issues.push({ kind: "semblables", source, claim: `${pair[0].join("")} semblable à ${pair[1].join("")}`, measured, ...at });
    }
    for (const pair of readParallel(clause)) {
      const measured = checkParallel(board, pair);
      if (measured) issues.push({ kind: "parallèles", source, claim: `(${pair[0]}) // (${pair[1]})`, measured, ...at });
    }
  }
  return issues;
}

/**
 * Les affirmations fausses d'une étape. `board` : le tableau une fois l'étape dessinée (ce que
 * l'élève a sous les yeux pendant la phrase).
 */
export function verifyStep(step: Step, board: BoardState): ClaimIssue[] {
  const issues = [...verifyText(board, step.say, "phrase")];
  (step.do ?? []).forEach((action, i) => {
    if (action.type === "note" && typeof action.text === "string") issues.push(...verifyText(board, action.text, "calcul", i));
    if ((action.type === "text" || action.type === "transform") && typeof (action as { text?: unknown }).text === "string") {
      issues.push(...verifyText(board, (action as { text: string }).text, "texte", i));
    }
  });
  if (step.check) {
    issues.push(...verifyText(board, step.check.prompt, "question"));
    const right = step.check.answer === undefined ? undefined : step.check.choices[step.check.answer];
    if (right) issues.push(...verifyText(board, right, "réponse"));
  }
  // Une même affirmation (la phrase répète la question) n'est comptée qu'une fois, sauf sur le tableau.
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = i.action === undefined ? `${i.kind}|${i.claim}` : `${i.kind}|${i.claim}|${i.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Le tableau une fois l'étape dessinée, sans horaire : ce que le vérificateur mesure. */
export function boardAfter(board: BoardState, step: Step, apply: (b: BoardState, action: NonNullable<Step["do"]>[number]) => BoardState): BoardState {
  let next = board;
  for (const action of step.do ?? []) {
    try {
      next = apply(next, action);
    } catch {
      // Une commande qui échoue ne dessine rien : le vérificateur mesure le reste.
    }
  }
  return next;
}

/** Le retour au modèle pour le tour suivant : il doit corriger devant l'élève. */
export function claimNotes(issues: readonly ClaimIssue[]): string[] {
  return issues.slice(0, 2).map(
    (i) =>
      `Affirmation fausse sur la figure (${i.source}) : « ${i.claim} », alors que ${i.measured}. Corrige-toi explicitement auprès de l'élève au début du tour, avec les bons noms de points.`,
  );
}
