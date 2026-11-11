import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateLesson } from "@/domain/nesalio/validate";
import { createLessonKeeper, keptLessonsDir } from "./keepLesson";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("leçons jouées gardées (NESALIO_GARDER_LECONS)", () => {
  it("est coupé par défaut ; « 1 » garde dans analyses/lecons-jouees, sinon dans le dossier donné", () => {
    expect(keptLessonsDir({} as NodeJS.ProcessEnv)).toBeNull();
    expect(keptLessonsDir({ NESALIO_GARDER_LECONS: "0" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(keptLessonsDir({ NESALIO_GARDER_LECONS: "1" } as unknown as NodeJS.ProcessEnv, "/depot/app")).toBe(resolve("/depot/analyses/lecons-jouees"));
    expect(keptLessonsDir({ NESALIO_GARDER_LECONS: "essais" } as unknown as NodeJS.ProcessEnv, "/depot/app")).toBe(resolve("/depot/app/essais"));
  });

  it("écrit une leçon jouable et son journal, une seule fois", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nesalio-garde-"));
    dirs.push(dir);
    const keeper = createLessonKeeper("Comment je résous 3x = 12 ?", dir, new Date("2026-11-09T20:00:00Z"));
    keeper.event({ kind: "lesson", lesson: { id: "equation", title: "Équation", language: "fr", learning_goal: "Isoler x." } } as never);
    keeper.event({
      kind: "slice",
      slice: {
        slice_id: "s1",
        introduces: [{ id: "eq", type: "math", content: "3x = 12" }],
        beats: [{ id: "b", say: "On isole x.", cues: [], do: [{ id: "w", verb: "write", target: "eq", at: "beat:start" }] }],
      },
    } as never);
    keeper.log("nesalio: relecture", "s1 — 0 alerte(s)");
    keeper.event({ kind: "end" });
    await keeper.finish();
    await keeper.finish();
    const files = readdirSync(dir).sort();
    expect(files).toEqual(["2026-11-09T20-00-00-equation.journal.txt", "2026-11-09T20-00-00-equation.json"]);
    expect(validateLesson(JSON.parse(readFileSync(join(dir, files[1]!), "utf8"))).ok).toBe(true);
    const journal = readFileSync(join(dir, files[0]!), "utf8");
    expect(journal).toContain("Question : Comment je résous 3x = 12 ?");
    expect(journal).toContain('Fin : {"kind":"end"} — 1 tranche(s)');
    expect(journal).toContain("nesalio: relecture s1 — 0 alerte(s)");
  });
});
