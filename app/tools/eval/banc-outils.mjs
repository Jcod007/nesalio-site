/**
 * Outils du banc de mesure Nesalio (banc-nesalio.test.mjs), sans appel au
 * modèle : lecture du corpus, texte dit et montré d'une leçon, contrôle de la
 * réponse attendue, tranches perdues, causes des refus et synthèse du rapport.
 * Testés par banc-outils.test.mjs dans la suite normale.
 */
import { readFileSync } from "node:fs";

export const CORPUS_URL = new URL("./corpus-nesalio.json", import.meta.url);

export function readCorpus(url = CORPUS_URL) {
  return JSON.parse(readFileSync(url, "utf8"));
}

/** Short label for a refusal reason, so that counts group the same cause together. */
export function cause(message) {
  const rules = [
    [/illisible/, "JSON illisible"],
    [/lesson doit venir avant/, "en-tête absent avant la tranche"],
    [/parties mises bout à bout/, "parties ≠ formule"],
    [/Objet effacé/, "objet visé après remove"],
    [/Cible non déclarée|Objet inconnu|non déclaré/, "cible inconnue"],
    [/Repère absent/, "repère absent"],
    [/Unrecognized key/, "clé inconnue"],
    [/must match pattern/, "identifiant invalide"],
    [/Nom inconnu/, "nom inconnu dans une expression"],
    [/Capacité non exécutable/, "capacité non jouable"],
    [/expected array|expected object|expected string|expected number|Invalid input/, "type ou champ manquant"],
  ];
  return rules.find(([pattern]) => pattern.test(message))?.[1] ?? "autre";
}

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/**
 * Text as a student reads it, simplified so that one pattern matches LaTeX,
 * unicode and plain writing alike: « \frac{1}{6} », « 1/6 » ; « H_{2}O », « H₂O » ;
 * « 2433{,}31 », « 2 433,31 ». Superscripts become « ^n » (x² → x^2).
 */
export function normalizeText(text) {
  let out = String(text).normalize("NFC");
  out = out.replace(/\\(?:left|right)\b/g, "");
  out = out.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  out = out.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√$1");
  out = out.replace(/\\(?:mathrm|text|textbf|mathbf|operatorname|ce|mbox)\s*\{([^{}]*)\}/g, "$1");
  const symbols = {
    times: "×",
    cdot: "·",
    pm: "±",
    pi: "π",
    mid: "|",
    approx: "≈",
    le: "≤",
    leq: "≤",
    ge: "≥",
    geq: "≥",
    to: "→",
    rightarrow: "→",
    longrightarrow: "→",
    rightleftharpoons: "⇌",
    Delta: "Δ",
    theta: "θ",
    degree: "°",
    circ: "°",
    lt: "<",
    gt: ">",
    neq: "≠",
    ne: "≠",
  };
  out = out.replace(/\\([A-Za-z]+)/g, (whole, name) => symbols[name] ?? whole);
  out = out.replace(/\\[,;:! ]|~/g, " ");
  out = out.replace(/\^\s*\{?\s*°\s*\}?/g, "°");
  out = out.replace(/[{}]/g, "");
  out = out.replace(/[₀-₉]/g, (d) => String(SUBSCRIPTS.indexOf(d)));
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) => "^" + [...run].map((d) => String(SUPERSCRIPTS.indexOf(d))).join(""));
  out = out.replace(/[−–‑]/g, "-");
  out = out.replace(/[   ]/g, " ");
  // Reduces « (1)/(6) » from \frac back to « 1/6 » when both sides are plain.
  out = out.replace(/\(([^()\s]+)\)\/\(([^()\s]+)\)/g, "$1/$2");
  return out.replace(/[ \t]+/g, " ");
}

function strings(value) {
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const REVEALING = new Set(["show", "draw", "write", "transform"]);

/**
 * What the student hears and sees: sentences said, texts of objects actually
 * shown (an object declared and never shown does not exist for the student),
 * and the declared objects never shown.
 */
export function lessonText(lesson) {
  const slices = lesson?.slices ?? [];
  const groups = new Map();
  const declared = new Map();
  const revealed = new Set();
  const transforms = [];
  const reveal = (id) => {
    if (revealed.has(id)) return;
    revealed.add(id);
    for (const member of groups.get(id) ?? []) reveal(member);
  };
  for (const slice of slices) {
    for (const group of slice.groups ?? []) groups.set(group.id, group.items ?? []);
    for (const object of slice.introduces ?? []) declared.set(object.id, object);
  }
  for (const slice of slices) {
    for (const beat of slice.beats ?? [])
      for (const action of beat.do ?? []) {
        if (!REVEALING.has(action.verb) || !action.target) continue;
        reveal(action.target);
        if (action.verb === "transform") {
          const { id, verb, target, at, ...rest } = action;
          transforms.push(...strings(rest));
        }
      }
  }
  const shown = [];
  for (const [id, object] of declared) {
    if (!revealed.has(id)) continue;
    shown.push(
      ...strings([
        object.content,
        object.parts?.map((p) => p.text),
        object.params,
        object.label,
        object.text,
        object.rows,
        object.row_labels,
        object.column_labels,
      ]),
    );
  }
  const said = slices.flatMap((s) => (s.beats ?? []).map((b) => b.say ?? ""));
  return {
    said: normalizeText(said.join("\n")),
    shown: normalizeText([...shown, ...transforms].join("\n")),
    neverShown: [...declared.keys()].filter((id) => !revealed.has(id) && !groups.has(id)),
    words: said.join(" ").split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Is the expected answer there? Every pattern of `reponse.motifs` must match the
 * board (`ou: "tableau"`) or the board and the voice together (`parole_ou_tableau`).
 */
export function checkAnswer(question, lesson) {
  const expected = question.reponse;
  if (!expected?.motifs?.length) return null;
  const text = lessonText(lesson);
  const where = expected.ou === "tableau" ? text.shown : `${text.shown}\n${text.said}`;
  const missing = expected.motifs.filter((pattern) => !new RegExp(pattern, "iu").test(where));
  // When the answer is only said, the report says so: the rule is « résultat écrit ».
  const saidOnly = expected.ou === "tableau" && missing.length > 0 && missing.every((pattern) => new RegExp(pattern, "iu").test(text.said));
  return { ok: missing.length === 0, missing, saidOnly };
}

/**
 * Tranches announced by the model and never played: an unreadable JSON line
 * names its `slice_id`; if that tranche was not played afterwards, it was lost.
 */
export function lostSlices(logs, playedIds) {
  const played = new Set(playedIds);
  const lost = [];
  for (const line of logs) {
    if (!line.includes("illisible")) continue;
    const id = line.match(/"slice_id"\s*:\s*"([^"]+)"/)?.[1] ?? "(sans identifiant)";
    if (!played.has(id) && !lost.includes(id)) lost.push(id);
  }
  return lost;
}

/** Outcome of one generation, from its events and the generator's log. */
export function outcomeOf({ events, logs, thrown }) {
  const last = events.at(-1);
  if (thrown) return "exception";
  if (last?.kind === "error") return `erreur ${last.code}`;
  if (logs.some((l) => l.startsWith("nesalio: leçon arrêtée"))) return "arrêtée sur refus";
  if (last?.kind === "end") return "complète";
  return "sans fin";
}

/**
 * An intact lesson: it ended normally, nothing announced was lost, and the
 * whole lesson is valid for the contract. This is the « leçons intactes » of Q7.
 */
export function isIntact(result) {
  return result.outcome === "complète" && result.lost.length === 0 && result.valid;
}

export function median(values) {
  const sorted = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Rough token count from characters (French, JSON): enough to compare models, not to bill. */
export const CHARS_PER_TOKEN = 3.5;

/** Totals over a set of results; `prices` in dollars per million tokens (input, output), optional. */
export function summarize(results, prices = {}) {
  const count = results.length;
  const intact = results.filter(isIntact).length;
  const outcomes = {};
  const causes = {};
  for (const r of results) {
    outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
    for (const line of [...r.refusals, ...r.unreadable]) {
      // A refusal line can carry several reasons: each cause counts once per refusal.
      for (const c of new Set(line.split(" | ").map(cause))) causes[c] = (causes[c] ?? 0) + 1;
    }
    if (r.outcome !== "complète") causes[`leçon : ${r.outcome}`] = (causes[`leçon : ${r.outcome}`] ?? 0) + 1;
    if (r.outcome === "complète" && !r.valid) causes["leçon entière invalide"] = (causes["leçon entière invalide"] ?? 0) + 1;
    if (r.lost.length) causes["tranche perdue sans refus"] = (causes["tranche perdue sans refus"] ?? 0) + r.lost.length;
  }
  const firsts = results.map((r) => r.firstSliceMs).filter((v) => v != null);
  const inputTokens = Math.round(results.reduce((s, r) => s + r.inputChars, 0) / CHARS_PER_TOKEN);
  const outputTokens = Math.round(results.reduce((s, r) => s + r.outputChars, 0) / CHARS_PER_TOKEN);
  const priced = Number.isFinite(prices.input) && Number.isFinite(prices.output);
  const answers = results.filter((r) => r.answer);
  return {
    lessons: count,
    intact,
    intactRate: count ? intact / count : null,
    outcomes,
    causes,
    refusals: results.reduce((s, r) => s + r.refusals.length, 0),
    repairs: results.reduce((s, r) => s + r.repairs.length, 0),
    unreadable: results.reduce((s, r) => s + r.unreadable.length, 0),
    calls: results.reduce((s, r) => s + r.calls, 0),
    firstSlice: { medianMs: median(firsts), maxMs: firsts.length ? Math.max(...firsts) : null },
    total: { medianMs: median(results.map((r) => r.ms)), maxMs: count ? Math.max(...results.map((r) => r.ms)) : null },
    answers: { checked: answers.length, written: answers.filter((r) => r.answer.ok).length, saidOnly: answers.filter((r) => r.answer.saidOnly).length },
    tokens: { input: inputTokens, output: outputTokens, approximate: true },
    costUsd: priced ? (inputTokens * prices.input + outputTokens * prices.output) / 1e6 : null,
  };
}

const pct = (value) => (value == null ? "—" : `${(100 * value).toFixed(1)} %`);
const sec = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);

/**
 * Report as Markdown. `q7` applies the automatic part of the confidence
 * criteria (decision Q7): ≥ 95 % intact lessons on ≥ 30 questions × 2 draws.
 * The others (grave errors, grid marks, visual mark) come from grading.
 */
export function reportMarkdown({ label, model, rounds, startedAt, summary, byDiscipline, results }) {
  const distinct = new Set(results.map((r) => r.id)).size;
  const enough = distinct >= 30 && rounds >= 2;
  const lines = [
    `# Banc Nesalio — ${label}`,
    "",
    `Modèle : \`${model}\` · tirages : ${rounds} · questions : ${distinct} · leçons : ${summary.lessons} · lancé le ${startedAt}`,
    "",
    "## Synthèse",
    "",
    "| Mesure | Valeur |",
    "| --- | --- |",
    `| Leçons intactes | **${summary.intact}/${summary.lessons} (${pct(summary.intactRate)})** |`,
    ...Object.entries(byDiscipline).map(([d, s]) => `| — dont ${d} | ${s.intact}/${s.lessons} (${pct(s.intactRate)}) |`),
    `| Issues | ${Object.entries(summary.outcomes)
      .map(([k, v]) => `${k} : ${v}`)
      .join(" ; ")} |`,
    `| 1re tranche (médiane / max) | ${sec(summary.firstSlice.medianMs)} / ${sec(summary.firstSlice.maxMs)} |`,
    `| Durée totale (médiane / max) | ${sec(summary.total.medianMs)} / ${sec(summary.total.maxMs)} |`,
    `| Refus (corrections demandées) | ${summary.refusals} |`,
    `| Réparations sans appel | ${summary.repairs} |`,
    `| Lignes JSON illisibles | ${summary.unreadable} |`,
    `| Appels au modèle | ${summary.calls} |`,
    `| Réponse attendue écrite au tableau | ${summary.answers.written}/${summary.answers.checked} (dite seulement : ${summary.answers.saidOnly}) |`,
    `| Jetons (approx., ${CHARS_PER_TOKEN} caractères/jeton) | entrée ${summary.tokens.input}, sortie ${summary.tokens.output} |`,
    `| Coût approximatif | ${summary.costUsd == null ? "non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons)" : `${summary.costUsd.toFixed(4)} $`} |`,
    "",
    "### Critère Q7 automatique (leçons intactes)",
    "",
    enough
      ? `${summary.intactRate >= 0.95 ? "**Atteint**" : "**Non atteint**"} : ${pct(summary.intactRate)} pour un seuil de 95 % (${distinct} questions × ${rounds} tirages).`
      : `Mesure partielle (${distinct} questions × ${rounds} tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.`,
    "Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.",
    "",
    "## Causes des refus et des échecs",
    "",
    ...(Object.keys(summary.causes).length
      ? Object.entries(summary.causes)
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => `- ${c} : ${n}`)
      : ["- aucune"]),
    "",
    "## Détail par leçon",
    "",
    "| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.id}#${r.round} | ${r.discipline} | ${r.outcome}${r.lost.length ? ` (perdue : ${r.lost.join(", ")})` : ""} | ${isIntact(r) ? "oui" : "**non**"} | ${r.slices} | ${sec(r.firstSliceMs)} | ${sec(r.ms)} | ${r.refusals.length} | ${r.repairs.length} | ${r.answer == null ? "—" : r.answer.ok ? "oui" : r.answer.saidOnly ? "dite seulement" : "**non**"} | ${r.neverShown.length} | ${r.guides.join(", ") || "aucun"} |`,
    ),
    "",
  ];
  return lines.join("\n");
}
