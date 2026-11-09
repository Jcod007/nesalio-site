/**
 * Rejoue les contrôles de justesse (coherence.ts) sur toutes les leçons enregistrées du banc
 * (analyses/banc/{c3,ap,m}-*), comme si chaque leçon venait d'être écrite par le modèle :
 * on compte, par règle, les refus (`refused`), les corrections et les simples notes.
 * Ignoré par la suite normale ; à lancer dans app/ avec :
 *   CONTROLES=1 npx vitest run tools/eval/controles-banc.test.mjs
 * Option : SORTIE=<fichier.json> pour écrire le détail (sinon seulement le résumé à l'écran).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { checkCoherence } from "@/domain/nesalio/coherence";
import { validateLesson } from "@/domain/nesalio/validate";

const BANC = new URL("../../../analyses/banc/", import.meta.url);

function lessons() {
  const root = fileURLToPath(BANC);
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((dir) => /^(c3|ap|m)-/.test(dir)).flatMap((dir) =>
    readdirSync(join(root, dir)).filter((file) => /-t\d+\.json$/.test(file)).map((file) => ({ id: `${dir}/${file}`, path: join(root, dir, file) })));
}

describe.skipIf(!process.env.CONTROLES)("contrôles de justesse rejoués sur le banc", () => {
  it("compte les refus par règle", () => {
    const detail = [];
    const counts = {};
    let invalid = 0;
    for (const { id, path } of lessons()) {
      let lesson;
      try { lesson = JSON.parse(readFileSync(path, "utf8")); } catch { continue; }
      if (!Array.isArray(lesson?.slices) || !lesson.slices.length) continue;
      // The saved lesson must keep loading as it is.
      const saved = validateLesson(lesson);
      if (!saved.ok) { invalid++; detail.push({ id, invalid: saved.issues.slice(0, 3) }); continue; }
      // Tranche by tranche, as the generator checks them.
      const alerts = [];
      let state = undefined;
      for (const slice of saved.value.slices) {
        const result = checkCoherence([slice], saved.state.math, state);
        state = result.state;
        alerts.push(...result.alerts.map((alert) => ({ ...alert, object: `${slice.slice_id}/${alert.object}` })));
      }
      for (const alert of alerts) {
        const key = `${alert.rule}:${alert.outcome}`;
        counts[key] = (counts[key] ?? 0) + 1;
        if (alert.outcome !== "noted" || process.env.NOTES) detail.push({ id, rule: alert.rule, outcome: alert.outcome, object: alert.object, message: alert.message });
      }
    }
    const lines = [JSON.stringify({ lecons: lessons().length, invalides: invalid, compte: counts }, null, 1),
      ...detail.map((entry) => entry.invalid ? `INVALIDE ${entry.id} ${JSON.stringify(entry.invalid)}` : `${entry.outcome.padEnd(9)} ${entry.rule.padEnd(18)} ${entry.id} — ${entry.message}`)];
    console.log(lines.join("\n"));
    if (process.env.SORTIE) writeFileSync(process.env.SORTIE, lines.join("\n"));
  });
});
