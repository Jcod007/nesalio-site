#!/usr/bin/env node
/**
 * Comparaison de deux déploiements déjà configurés, avec leur vrai modèle.
 * LEGACY_URL=... SEGMENTED_URL=... SELFTEST_TOKEN=... node tools/eval/comparer-formats-modele.mjs
 * Les deux URLs doivent pointer vers des déploiements privés contrôlés par l'utilisateur,
 * d'une révision historique qui accepte encore TUTOR_STEP_FORMAT.
 * Le jeton diagnostic est envoyé aux deux URLs : ne jamais utiliser une URL non fiable.
 * Les appels au modèle et à la voix peuvent être facturés. Pas de données élève réelles.
 */
const token = process.env.SELFTEST_TOKEN;
const urls = { legacy: process.env.LEGACY_URL, segmented: process.env.SEGMENTED_URL };
if (!token || !urls.legacy || !urls.segmented) {
  console.error("Configurer LEGACY_URL, SEGMENTED_URL et SELFTEST_TOKEN dans l'environnement.");
  process.exit(2);
}
for (const [mode, value] of Object.entries(urls)) {
  const url = new URL(value);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error(`${mode}: HTTPS requis`);
}
if (urls.legacy.replace(/\/$/, "") === urls.segmented.replace(/\/$/, "")) throw new Error("Il faut deux déploiements configurés avec des formats différents.");

const questions = [
  { id: "triangle", ask: "Explique-moi un triangle rectangle de côtés 3 et 4 et montre son hypoténuse. Sans question." },
  { id: "parabole", ask: "Explique-moi la parabole f(x)=−(x−2)²+3 et montre son sommet. Sans question." },
  { id: "mouvement", ask: "Explique l'addition de deux vecteurs en montrant le mouvement. Sans question." },
];
const repetitions = Math.max(1, Math.min(5, Number(process.env.REPETITIONS) || 2));
const rows = [];
for (let round = 0; round < repetitions; round++) for (const q of questions) {
  const order = round % 2 ? ["segmented", "legacy"] : ["legacy", "segmented"];
  for (const mode of order) {
    const url = new URL("/api/diagnostic", urls[mode]);
    url.search = new URLSearchParams({ ask: q.ask, turns: "1", raw: "1" }).toString();
    const started = Date.now();
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(240000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const report = await response.json();
      const lesson = report.lesson ?? {};
      const events = (report.raw ?? []).flat();
      const steps = events.filter((event) => event?.kind === "step");
      const formats = [...new Set(steps.map((step) => Array.isArray(step.segments) ? "segmented" : "legacy"))];
      const row = { round: round + 1, scenario: q.id, requested: mode, received: formats,
        model: lesson.model ?? null, provider: lesson.provider ?? null, effort: lesson.effort ?? null,
        totalMs: Date.now() - started, firstStepMs: report.turns?.[0]?.firstStepMs ?? null,
        steps: lesson.stepCount ?? null, actions: lesson.actionCount ?? null,
        rejected: lesson.rejected?.count ?? null, missingTargets: lesson.unknownTargets?.length ?? null,
        error: lesson.error ?? null };
      rows.push(row);
      console.log(JSON.stringify(row));
    } catch (error) {
      const row = { round: round + 1, scenario: q.id, requested: mode, error: error.message };
      rows.push(row); console.log(JSON.stringify(row));
    }
  }
}
const invalid = rows.filter((row) => row.error || row.provider === "demo" || row.received?.length !== 1 || row.received?.[0] !== row.requested);
const settings = new Set(rows.filter((row) => !row.error).map((row) => JSON.stringify([row.provider, row.model, row.effort])));
console.log(JSON.stringify({ count: rows.length, invalid: invalid.length, sameModelAndEffort: settings.size === 1,
  note: "Mesures serveur seulement : la qualité pédagogique, le rendu, le son et la synchronisation doivent aussi être évalués dans le navigateur." }));
if (invalid.length || settings.size !== 1) process.exitCode = 1;
