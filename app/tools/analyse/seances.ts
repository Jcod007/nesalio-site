/**
 * Relecture des séances enregistrées : rejoue chaque séance sur un tableau
 * (le même code que l'application) et mesure ce que le JSON permet de mesurer.
 *
 *   curl "<app>/api/seances?check=<jeton>&jour=AAAA-MM-JJ" -o seances.json
 *   npx tsx tools/analyse/seances.ts seances.json > rapport.md
 *
 * Par séance : questions, réponses de l'élève, attente, puis les mesures :
 * - chevauchements (domain/board/collisions, sur les empreintes du moteur) : un
 *   texte ou une étiquette posé sur un autre texte, sur un point, barré par un
 *   trait, dans une surface remplie ; chiffres de graduations qui se touchent ;
 * - objets sans repère : dessinés sans être rattachés à un mot de la phrase ({id}) ;
 * - relecture du tour (domain/tutor/turnReview) : « dit sans montrer », cibles
 *   absentes, phrases trop longues, gestes ;
 * - commandes refusées par le validateur, et commandes qui échouent au rejeu.
 * Puis la transcription : ce que Nesa a dit et dessiné, tour par tour.
 */
import { readFileSync } from "node:fs";
import type { TurnRecord } from "@/domain/sessionLog";
import { emptyBoard, type BoardState } from "@/domain/board/state";
import { collisions, covered, figureOutline, type CollisionKind } from "@/domain/board/collisions";
import { applyAction } from "@/domain/scene/commands";
import type { Step } from "@/domain/scene/schema";
import { reviewTurn } from "@/domain/tutor/turnReview";
import { verifyStep } from "@/domain/tutor/claims";

type Input = { turns?: TurnRecord[] } | TurnRecord[];

/** Paires d'objets qui se gênent au tableau (voir domain/board/collisions). */
export function overlaps(state: BoardState): Array<{ a: string; b: string; kind: CollisionKind; ratio: number }> {
  return collisions(state);
}

/** Commandes dont le but est de faire bouger des objets : leurs mouvements sont voulus. */
const MOVING = new Set(["move", "rotate", "transform", "applyMatrix", "copy"]);

/** Objets déjà là (non effacés) dont la place ou l'étiquette a changé à cause d'une commande qui ne les visait pas. */
function imposedMoves(before: BoardState, after: BoardState, action: Step["do"] extends (infer A)[] | undefined ? A : never): number {
  if (MOVING.has(action.type)) return 0;
  let count = 0;
  for (const id of before.order) {
    const a = before.nodes[id];
    const b = after.nodes[id];
    if (!a || !b || a.erased || b.erased) continue;
    const moved = a.offset[0] !== b.offset[0] || a.offset[1] !== b.offset[1];
    const relabelled = "labelAt" in a && "labelAt" in b && JSON.stringify(a.labelAt) !== JSON.stringify(b.labelAt);
    if (moved || relabelled) count++;
  }
  return count;
}

interface SessionReport {
  session: string;
  ref: string | null;
  start: string;
  turns: TurnRecord[];
  overlaps: Map<string, { ratio: number; kind: CollisionKind; say: string }>;
  /** Superpositions demandées par la phrase (« je fais glisser l'image sur l'original ») : voulues, comptées à part. */
  wanted: Map<string, { ratio: number; kind: CollisionKind; say: string }>;
  /**
   * Images d'une transformation posées sur leur original (y compris l'image qui l'englobe, que le
   * détecteur de chevauchements tolère) ; hors l'image que la phrase fait glisser exprès et la figure
   * qui est sa propre image (axe de symétrie).
   */
  imagesOnFigure: Array<{ image: string; ratio: number; say: string }>;
  /** Transformations dessinées (image d'une figure). */
  images: number;
  /** Affirmations que la figure contredit (rapports, triangles semblables, parallèles : domain/tutor/claims). */
  falseClaims: Array<{ claim: string; measured: string; source: string; say: string }>;
  uncued: number;
  /** Objets déjà au tableau que le moteur a déplacés sans que le modèle le demande (pile de calculs, textes poussés…). */
  shifted: number;
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
    // L'identifiant entier : deux séances dont l'identifiant commence pareil restent distinctes.
    const key = turn.session ?? "sans-session";
    let s = sessions.get(key);
    if (!s) {
      s = {
        session: key, ref: turn.ref ?? null, start: turn.at, turns: [], overlaps: new Map(), wanted: new Map(), imagesOnFigure: [], images: 0, falseClaims: [], uncued: 0, shifted: 0, drawn: 0, replayErrors: [],
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
      /** Ce que la phrase fait bouger exprès (glisser sur l'original, copie sur place, rotation) : sa superposition est voulue. */
      const moved = new Set<string>();
      for (const action of step.do ?? []) {
        if (!MOVING.has(action.type)) continue;
        const a = action as { id?: string; target?: string; targets?: string[] };
        for (const id of [a.id, a.target, ...(a.targets ?? [])]) if (id) moved.add(id);
      }
      for (const action of step.do ?? []) {
        try {
          const previous = board;
          board = applyAction(board, action, { start: 0, duration: 0 });
          s.shifted += imposedMoves(previous, board, action);
          if (action.type === "image" && board.groups[action.id] && !previous.groups[action.id]) {
            s.images++;
            const original = figureOutline(board, action.target);
            const image = figureOutline(board, action.id);
            if (original && image && !moved.has(action.id)) {
              const a = covered(original, image);
              const b = covered(image, original);
              const itself = Math.min(a, b) > 0.95;
              if (!itself && Math.max(a, b) > 0.05) s.imagesOnFigure.push({ image: action.id, ratio: Math.round(Math.max(a, b) * 100) / 100, say: step.say.slice(0, 90) });
            }
          }
        } catch (error) {
          s.replayErrors.push(`${action.type} : ${(error as Error).message}`.slice(0, 160));
        }
      }
      for (const issue of verifyStep(step, board)) s.falseClaims.push({ claim: issue.claim, measured: issue.measured, source: issue.source, say: step.say.slice(0, 90) });
      const created = Object.keys(board.nodes).filter((id) => !before.has(id) && board.nodes[id]?.type !== "text");
      s.drawn += created.length;
      s.uncued += created.filter((id) => !(step.cues && id in step.cues)).length;
      const groupsOf = (id: string) => Object.values(board.groups).filter((g) => g.members.includes(id)).map((g) => g.id);
      // « A·étiquette » : l'étiquette du point A, qui bouge avec lui.
      const intended = (raw: string) => {
        const id = raw.split("·")[0]!;
        return [id, ...groupsOf(id)].some((x) => moved.has(x) || [...moved].some((m) => x.startsWith(`${m}-`)));
      };
      for (const o of overlaps(board)) {
        const pair = o.kind === "graduations" ? `graduations ${o.a}` : `${o.a} × ${o.b}`;
        const into = o.kind !== "graduations" && (intended(o.a) || intended(o.b)) ? s.wanted : s.overlaps;
        // Une superposition voulue le reste tant qu'elle dure (les phrases suivantes ne la recomptent pas).
        if (s.wanted.has(pair) || s.overlaps.has(pair)) continue;
        into.set(pair, { ratio: o.ratio, kind: o.kind, say: step.say.slice(0, 90) });
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
  const byKind = (kind: CollisionKind) => sum((s) => [...s.overlaps.values()].filter((o) => o.kind === kind).length);
  lines.push(
    `- Chevauchements (paires distinctes) : ${sum((s) => s.overlaps.size)} · texte sur texte ${byKind("texte")} · sur un point ${byKind("point")} · barré par un trait ${byKind("trait")} · dans une surface ${byKind("surface")} · graduations ${byKind("graduations")} · dessins l'un sur l'autre ${byKind("dessins")}`,
  );
  lines.push(`- Superpositions voulues (l'objet que la phrase fait glisser, copie ou tourne) : ${sum((s) => s.wanted.size)}`);
  lines.push(`- Images posées sur leur original (englobée comprise) : ${sum((s) => s.imagesOnFigure.length)} sur ${sum((s) => s.images)} transformations`);
  lines.push(`- Affirmations contredites par la figure : ${sum((s) => s.falseClaims.length)}`);
  lines.push(`- Déplacements imposés par le moteur (objets déjà au tableau) : ${sum((s) => s.shifted)}`);
  lines.push(`- Objets dessinés sans repère dans la phrase : ${sum((s) => s.uncued)} sur ${sum((s) => s.drawn)}`);
  lines.push(`- « Dit sans montrer » : ${sum((s) => s.unshown.length)} · cibles absentes : ${sum((s) => s.missingTargets.size)} · phrases trop longues : ${sum((s) => s.longSentences)}`);
  lines.push(`- Commandes refusées : ${sum((s) => s.rejected.length)} · erreurs au rejeu : ${sum((s) => s.replayErrors.length)} · erreurs envoyées : ${sum((s) => s.errors.length)}`);
  lines.push(`- Vérifications réussies : ${sum((s) => s.checks.right)} / ${sum((s) => s.checks.total)} · tours interrompus : ${sum((s) => s.cancelled)}`);
  for (const s of sessions) {
    lines.push("", `## Séance ${s.session.replace(/-/g, "").slice(0, 8)}${s.ref ? ` (inscription ${s.ref})` : ""} · ${s.start.slice(11, 16)} UTC · ${s.turns.length} tours`);
    lines.push(
      `Attente médiane ${sec(median(s.firstStepMs))} · ${s.steps} phrases, ${s.gestures} gestes · sans repère ${s.uncued}/${s.drawn} · vérifications ${s.checks.right}/${s.checks.total} · interrompus ${s.cancelled}`,
    );
    for (const [pair, o] of s.overlaps) {
      const amount = o.kind === "trait" ? `${o.ratio} points du trait` : o.kind === "graduations" ? `${o.ratio} chiffres` : `${Math.round(o.ratio * 100)} %`;
      lines.push(`- Chevauchement (${o.kind}) ${pair} (${amount}) pendant « ${o.say} »`);
    }
    for (const o of s.imagesOnFigure) lines.push(`- Image sur l'original ${o.image} (${Math.round(o.ratio * 100)} %) pendant « ${o.say} »`);
    for (const c of s.falseClaims) lines.push(`- Affirmation fausse (${c.source}) « ${c.claim} » : ${c.measured}, pendant « ${c.say} »`);
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
        if (e.kind === "diagnosis") {
          const gaps = e.gaps.map((g) => `${g.notion}${g.level ? ` (${g.level})` : ""} : ${g.status}${g.evidence ? ` [${g.evidence}]` : ""}`);
          lines.push(`    🩺 ${gaps.length ? gaps.join(" ; ") : "aucune lacune"}${e.strengths.length ? ` · forces : ${e.strengths.join(" ; ")}` : ""}${e.next ? ` · suite : ${e.next}` : ""}`);
        }
        if (e.kind === "end") {
          lines.push(`  - Fin : ${e.summary.join(" / ")}`);
          if (e.noticed) lines.push(`  - Remarqué : forces ${e.noticed.strengths.join(" ; ")} · à travailler ${e.noticed.toWork.join(" ; ")}`);
        }
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
