/**
 * Relecture des séances enregistrées : rejoue chaque séance sur un tableau
 * (le même code que l'application) et mesure ce que le JSON permet de mesurer.
 *
 *   curl "<app>/api/seances?check=<jeton>&jour=AAAA-MM-JJ" -o seances.json
 *   npx tsx tools/analyse/seances.ts seances.json > rapport.md
 *
 * Par séance : questions, réponses de l'élève, attente, puis les mesures :
 * - chevauchements : deux textes (ou un texte sur une forme fermée) qui se
 *   recouvrent à plus de 25 % de la plus petite boîte (tailles de texte estimées) ;
 * - objets sans repère : dessinés sans être rattachés à un mot de la phrase ({id}) ;
 * - relecture du tour (domain/tutor/turnReview) : « dit sans montrer », cibles
 *   absentes, phrases trop longues, gestes ;
 * - commandes refusées par le validateur, et commandes qui échouent au rejeu.
 * Puis la transcription : ce que Nesa a dit et dessiné, tour par tour.
 */
import { readFileSync } from "node:fs";
import type { TurnRecord } from "@/domain/sessionLog";
import { emptyBoard, visibleNodes, type BoardNode, type BoardState } from "@/domain/board/state";
import { nodeBox, type Box } from "@/domain/board/layout";
import { applyAction } from "@/domain/scene/commands";
import type { Step } from "@/domain/scene/schema";
import { reviewTurn } from "@/domain/tutor/turnReview";

type Input = { turns?: TurnRecord[] } | TurnRecord[];

const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
function overlapRatio(a: Box, b: Box): number {
  const inter = area({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
  const smaller = Math.min(area(a), area(b));
  return smaller > 0 ? inter / smaller : 0;
}

const isText = (n: BoardNode) => n.type === "text";
const isClosedShape = (n: BoardNode) => n.type === "circle" || n.type === "polygon" || n.type === "point";
const label = (n: BoardNode) => ("label" in n && n.label) || ("text" in n && typeof n.text === "string" ? n.text : "") || "";

/** Paires d'objets qui se recouvrent : texte sur texte, ou texte sur une forme fermée / un point. */
export function overlaps(state: BoardState): Array<{ a: string; b: string; ratio: number }> {
  const nodes = visibleNodes(state);
  const out: Array<{ a: string; b: string; ratio: number }> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const relevant = (isText(a) && (isText(b) || isClosedShape(b))) || (isText(b) && isClosedShape(a));
      if (!relevant) continue;
      const ratio = overlapRatio(nodeBox(a, state.frame), nodeBox(b, state.frame));
      if (ratio > 0.25) out.push({ a: a.id, b: b.id, ratio: Math.round(ratio * 100) / 100 });
    }
  }
  return out;
}

interface SessionReport {
  session: string;
  ref: string | null;
  start: string;
  turns: TurnRecord[];
  overlaps: Map<string, { ratio: number; say: string }>;
  uncued: number;
  drawn: number;
  replayErrors: string[];
  unshown: Array<{ say: string; word: string }>;
  missingTargets: Set<string>;
  longSentences: number;
  gestures: number;
  steps: number;
  rejected: string[];
  checks: { right: number; total: number };
  firstStepMs: number[];
  cancelled: number;
  errors: string[];
}

function steps(turn: TurnRecord): Step[] {
  return turn.events.filter((e): e is Extract<typeof e, { kind: "step" }> => e.kind === "step");
}

export function analyse(turns: readonly TurnRecord[]): SessionReport[] {
  const sessions = new Map<string, SessionReport>();
  const boards = new Map<string, BoardState>();
  for (const turn of turns) {
    const key = (turn.session ?? "sans-session").replace(/-/g, "").slice(0, 8);
    let s = sessions.get(key);
    if (!s) {
      s = {
        session: key, ref: turn.ref ?? null, start: turn.at, turns: [], overlaps: new Map(), uncued: 0, drawn: 0, replayErrors: [],
        unshown: [], missingTargets: new Set(), longSentences: 0, gestures: 0, steps: 0, rejected: [], checks: { right: 0, total: 0 },
        firstStepMs: [], cancelled: 0, errors: [],
      };
      sessions.set(key, s);
    }
    if (!s.ref && turn.ref) s.ref = turn.ref;
    s.turns.push(turn);
    // Une nouvelle question ouvre une nouvelle explication : le tableau repart de zéro.
    let board = turn.mode === "question" || !boards.has(key) ? emptyBoard() : boards.get(key)!;
    const turnSteps = steps(turn);
    for (const step of turnSteps) {
      const before = new Set(Object.keys(board.nodes));
      for (const action of step.do ?? []) {
        try {
          board = applyAction(board, action, { start: 0, duration: 0 });
        } catch (error) {
          s.replayErrors.push(`${action.type} : ${(error as Error).message}`.slice(0, 160));
        }
      }
      const created = Object.keys(board.nodes).filter((id) => !before.has(id) && board.nodes[id]?.type !== "text");
      s.drawn += created.length;
      s.uncued += created.filter((id) => !(step.cues && id in step.cues)).length;
      for (const o of overlaps(board)) {
        const pair = `${o.a} × ${o.b}`;
        if (!s.overlaps.has(pair)) s.overlaps.set(pair, { ratio: o.ratio, say: step.say.slice(0, 90) });
      }
    }
    boards.set(key, board);
    const review = reviewTurn(turnSteps, board);
    s.steps += review.steps;
    s.gestures += review.gestures;
    s.longSentences += review.longSentences;
    s.unshown.push(...review.unshown);
    review.missingTargets.forEach((t) => s!.missingTargets.add(t));
    for (const e of turn.events) {
      if (e.kind === "await" && e.rejected) s.rejected.push(...e.rejected);
      if (e.kind === "error") s.errors.push(`${e.code} : ${e.message}`);
    }
    if (turn.answer && turn.answer.correct !== null) {
      s.checks.total++;
      if (turn.answer.correct) s.checks.right++;
    }
    if (turn.latencyMs.firstStep !== undefined) s.firstStepMs.push(turn.latencyMs.firstStep);
    if (turn.outcome !== "complete") s.cancelled++;
  }
  return [...sessions.values()];
}

const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0);

export function report(sessions: readonly SessionReport[], withTranscript = true): string {
  const lines: string[] = [];
  const allFirst = sessions.flatMap((s) => s.firstStepMs);
  const sum = (f: (s: SessionReport) => number) => sessions.reduce((t, s) => t + f(s), 0);
  lines.push(`# Séances : ${sessions.length} séances, ${sum((s) => s.turns.length)} tours, ${sum((s) => s.steps)} phrases`);
  lines.push("");
  lines.push(`- Attente avant la première phrase : médiane ${sec(median(allFirst))}, max ${sec(Math.max(0, ...allFirst))}`);
  lines.push(`- Chevauchements (paires distinctes) : ${sum((s) => s.overlaps.size)}`);
  lines.push(`- Objets dessinés sans repère dans la phrase : ${sum((s) => s.uncued)} sur ${sum((s) => s.drawn)}`);
  lines.push(`- « Dit sans montrer » : ${sum((s) => s.unshown.length)} · cibles absentes : ${sum((s) => s.missingTargets.size)} · phrases trop longues : ${sum((s) => s.longSentences)}`);
  lines.push(`- Commandes refusées : ${sum((s) => s.rejected.length)} · erreurs au rejeu : ${sum((s) => s.replayErrors.length)} · erreurs envoyées : ${sum((s) => s.errors.length)}`);
  lines.push(`- Vérifications réussies : ${sum((s) => s.checks.right)} / ${sum((s) => s.checks.total)} · tours interrompus : ${sum((s) => s.cancelled)}`);
  for (const s of sessions) {
    lines.push("", `## Séance ${s.session}${s.ref ? ` (inscription ${s.ref})` : ""} · ${s.start.slice(11, 16)} UTC · ${s.turns.length} tours`);
    lines.push(
      `Attente médiane ${sec(median(s.firstStepMs))} · ${s.steps} phrases, ${s.gestures} gestes · sans repère ${s.uncued}/${s.drawn} · vérifications ${s.checks.right}/${s.checks.total} · interrompus ${s.cancelled}`,
    );
    for (const [pair, o] of s.overlaps) lines.push(`- Chevauchement ${pair} (${Math.round(o.ratio * 100)} %) pendant « ${o.say} »`);
    for (const u of s.unshown) lines.push(`- Dit sans montrer (« ${u.word} ») : « ${u.say} »`);
    if (s.missingTargets.size) lines.push(`- Cibles absentes : ${[...s.missingTargets].join(", ")}`);
    for (const r of s.rejected) lines.push(`- Refusé : ${r}`);
    for (const e of s.replayErrors) lines.push(`- Échec au rejeu : ${e}`);
    for (const e of s.errors) lines.push(`- Erreur envoyée à l'élève : ${e}`);
    if (!withTranscript) continue;
    lines.push("");
    for (const t of s.turns) {
      const head = t.mode === "continue" && t.answer
        ? `**Élève répond** « ${t.answer.picked} » à « ${t.answer.prompt} » (${t.answer.correct === null ? "sans bonne réponse" : t.answer.correct ? "juste" : "faux"}${t.answer.misconception ? `, erreur : ${t.answer.misconception}` : ""})`
        : `**Élève (${t.mode})** : ${t.question}`;
      lines.push(`${head} · ${t.outcome}, 1re phrase ${t.latencyMs.firstStep !== undefined ? sec(t.latencyMs.firstStep) : "—"}, tour ${sec(t.latencyMs.total)}`);
      for (const e of t.events) {
        if (e.kind === "lesson") lines.push(`  - Leçon « ${e.title} »${e.goals?.length ? ` · objectifs : ${e.goals.join(" / ")}` : ""}`);
        if (e.kind === "step") {
          const types = (e.do ?? []).map((a) => a.type).join(", ");
          lines.push(`  - ${e.say}${types ? `  [${types}]` : ""}`);
          if (e.check) lines.push(`    ? ${e.check.prompt} → ${e.check.choices.map((c, i) => (i === e.check!.answer ? `*${c}*` : c)).join(" | ")}`);
        }
        if (e.kind === "end") lines.push(`  - Fin : ${e.summary.join(" / ")}`);
      }
    }
  }
  return lines.join("\n");
}

if (process.argv[2]) {
  const raw = JSON.parse(readFileSync(process.argv[2], "utf8")) as Input;
  const turns = Array.isArray(raw) ? raw : (raw.turns ?? []);
  process.stdout.write(report(analyse(turns), !process.argv.includes("--sans-transcription")) + "\n");
}
