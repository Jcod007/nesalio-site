/**
 * Vérification d'une vidéo avant l'export : ce qui risque de se voir de travers.
 *
 * Le script est joué au tableau exactement comme dans la vidéo (stage.ts),
 * puis relu plan par plan avec les outils de mesure du moteur :
 * - commandes refusées (rien ne s'affichera) et cibles absentes ;
 * - objets qui se chevauchent (domain/board/collisions, les mêmes empreintes
 *   que le moteur de placement), sauf quand le plan les superpose exprès ;
 * - figure trop large pour un écran vertical ;
 * - texte trop long pour être lu, plan sans rien de nouveau, plan allongé.
 *
 * Déterministe et rapide : refait à chaque modification du script.
 */
import { collisions } from "@/domain/board/collisions";
import { contentBox } from "@/domain/board/layout";
import { resolveTargets, type BoardState } from "@/domain/board/state";
import type { StudioScript } from "./script";
import { MAX_HOOK } from "./script";
import { boardsAfterShots } from "./stage";
import type { Timeline } from "./timeline";

export type Severity = "error" | "warn" | "info";

export interface Finding {
  /** Rang du plan dans le script, ou `null` pour la vidéo entière. */
  shot: number | null;
  severity: Severity;
  message: string;
}

/** Au-delà, un texte à l'écran ne se lit plus d'un coup d'œil. */
const MAX_WORDS = 12;
/** Largeur / hauteur au-delà de laquelle la figure devient petite dans un cadre 9:16. */
const WIDE_RATIO = 1.9;
/** Commandes qui superposent volontairement des objets (glisser sur l'original, copie posée dessus). */
const OVERLAPPING = new Set(["move", "copy", "rotate", "transform", "applyMatrix", "image", "vectorOp"]);

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function targetsOf(action: { type: string } & Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["target", "onto", "near", "of"] as const) {
    const value = action[key];
    if (typeof value === "string") out.push(value);
  }
  return out;
}

function exists(board: BoardState, id: string): boolean {
  return id in board.nodes || resolveTargets(board, id).length > 0 || id in board.groups;
}

export function checkVideo(script: StudioScript, timeline: Timeline): Finding[] {
  const findings: Finding[] = [];
  const boards = boardsAfterShots(timeline);
  let previousPairs = new Set<string>();
  let previous: BoardState | null = null;

  timeline.shots.forEach((planned, position) => {
    const shot = script.shots[planned.index]!;
    const board = boards[position]!;
    const at = planned.index;

    for (const issue of shot.issues ?? []) {
      findings.push({ shot: at, severity: "error", message: `Commande refusée, rien ne s'affichera : ${issue}` });
    }

    // Une cible qui n'existe pas au tableau au moment du plan : la commande ne fait rien.
    for (const action of shot.do) {
      const record = action as unknown as { type: string } & Record<string, unknown>;
      for (const id of targetsOf(record)) {
        const known = (previous && exists(previous, id)) || exists(board, id);
        if (!known) findings.push({ shot: at, severity: "error", message: `« ${action.type} » vise « ${id} », qui n'est pas au tableau.` });
      }
    }

    if (shot.do.length === 0) findings.push({ shot: at, severity: "warn", message: "Rien ne change à l'écran pendant ce plan." });

    const count = words(shot.text);
    if (count > MAX_WORDS) {
      findings.push({ shot: at, severity: "warn", message: `Texte long (${count} mots) : difficile à lire en ${Math.round(planned.durationMs / 100) / 10} s.` });
    }
    if (shot.bars !== undefined && planned.bars > shot.bars) {
      findings.push({ shot: at, severity: "info", message: `Plan allongé à ${planned.bars} mesure(s) pour finir le dessin et laisser lire.` });
    }

    // Chevauchements nouveaux dans ce plan (ceux qui existaient déjà ont été signalés au plan d'avant).
    const intended = new Set(shot.do.filter((a) => OVERLAPPING.has(a.type)).flatMap((a) => targetsOf(a as unknown as { type: string } & Record<string, unknown>)));
    const pairs = new Set<string>();
    for (const c of collisions(board)) {
      const key = [c.a, c.b].sort().join(" / ");
      pairs.add(key);
      if (previousPairs.has(key)) continue;
      const base = (name: string) => name.split("·")[0]!;
      if (intended.has(base(c.a)) || intended.has(base(c.b))) continue;
      findings.push({ shot: at, severity: "warn", message: `Chevauchement (${c.kind}) : ${c.a} et ${c.b}.` });
    }
    previousPairs = pairs;

    const box = contentBox(board);
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    // Une figure plate (un segment, un axe seul) compte comme une figure d'une unité de haut.
    if (width > 4 && width / Math.max(height, 1) > WIDE_RATIO) {
      findings.push({ shot: at, severity: "warn", message: "Figure très large : elle sera petite sur un écran vertical. Resserre-la ou rends-la plus haute." });
    }
    previous = board;
  });

  const dropped = script.shots.length - timeline.shots.length;
  if (dropped > 0) {
    findings.push({ shot: null, severity: "warn", message: `${dropped} plan(s) retiré(s) : la vidéo dépasserait 60 secondes.` });
  }
  if (script.hook.length > MAX_HOOK) findings.push({ shot: null, severity: "warn", message: "Accroche longue : vise 60 caractères au plus." });
  if (!script.shots.some((s) => s.reveal)) {
    findings.push({ shot: null, severity: "info", message: "Aucun plan de révélation : la musique ne marquera pas de moment fort." });
  }
  if (timeline.totalMs < 10_000) findings.push({ shot: null, severity: "info", message: "Vidéo de moins de 10 s : ajoute un plan pour la chute." });

  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  return findings.sort((a, b) => (a.shot ?? -1) - (b.shot ?? -1) || order[a.severity] - order[b.severity]);
}
