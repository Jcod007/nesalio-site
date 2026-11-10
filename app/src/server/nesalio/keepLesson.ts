/**
 * Garde chaque leçon générée par /api/nesalio, pour vérifier le rendu après coup : le JSON
 * jouable (même forme que le banc : coque du moteur + en-tête + tranches) et un journal (question,
 * fin, refus, relecteur). Demandé par l'utilisateur le 2026-11-09 : sans le JSON d'une leçon jouée,
 * un défaut vu à l'écran (récapitulatif vide) ne pouvait pas être diagnostiqué.
 *
 * Contient la question de l'élève : seulement si NESALIO_GARDER_LECONS est réglé (« 1 » : dossier
 * analyses/lecons-jouees à la racine du dépôt ; sinon le chemin donné). Jamais en production
 * par défaut. Une erreur d'écriture n'interrompt jamais la leçon.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import shell from "@/domain/nesalio/engineShell.json";
import type { NesalioEvent } from "./generator";

export interface LessonKeeper {
  log(message: string, detail?: unknown): void;
  event(event: NesalioEvent): void;
  /** Writes the files once (end, error or the student leaving). */
  finish(reason?: string): Promise<void>;
}

/** The folder lessons are kept in, or null when keeping is off. */
export function keptLessonsDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string | null {
  const value = env.NESALIO_GARDER_LECONS?.trim();
  if (!value || value === "0") return null;
  // The app runs from app/: the repository's analyses folder is one level up.
  return value === "1" ? resolve(cwd, "..", "analyses", "lecons-jouees") : resolve(cwd, value);
}

const text = (detail: unknown) => typeof detail === "string" ? detail
  : detail instanceof Error ? `${detail.name}: ${detail.message}` : detail === undefined ? "" : JSON.stringify(detail);

export function createLessonKeeper(question: string, dir: string, now = new Date()): LessonKeeper {
  const logs: string[] = [];
  const slices: unknown[] = [];
  let header: Extract<NesalioEvent, { kind: "lesson" }> | undefined;
  let ending: NesalioEvent | undefined;
  let done = false;
  const started = now.getTime();
  return {
    log(message, detail) { logs.push(`${message} ${text(detail)}`.trim()); },
    event(event) {
      if (event.kind === "lesson") header = event;
      else if (event.kind === "slice") slices.push(event.slice);
      else ending = event;
    },
    async finish(reason) {
      if (done) return;
      done = true;
      const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const id = (header?.lesson.id ?? "sans-en-tete").replace(/[^\w-]+/g, "_").slice(0, 60);
      const base = join(dir, `${stamp}-${id}`);
      const lesson = {
        ...shell, lesson: header?.lesson ?? shell.lesson,
        scene: { ...shell.scene, math_context: header?.math_context ?? { symbols: {}, expressions: {} } },
        slices,
      };
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(`${base}.json`, JSON.stringify(lesson, null, 1));
        await writeFile(`${base}.journal.txt`, [
          `Question : ${question}`,
          `Fin : ${ending ? JSON.stringify(ending) : reason ?? "flux fermé"} — ${slices.length} tranche(s) — ${Date.now() - started} ms`,
          ...logs,
        ].join("\n"));
      } catch (error) {
        console.warn("nesalio: leçon non gardée", error);
      }
    },
  };
}
