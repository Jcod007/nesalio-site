/**
 * Mesures du banc avec relecteur : leçons intactes, délais, attente estimée de l'élève, relectures.
 * Usage : node analyses/relecture/mesurer.mjs <dossier banc> [<dossier banc>…] [--tirage=1]
 * Attente estimée : la lecture commence quand la 1re tranche arrive ; chaque tranche dure ses mots à
 * VITESSE mots/min (150 × 0,85, vitesse de la voix) ; l'élève attend quand une tranche arrive après la
 * fin de la précédente. Approximation : ignore le délai de la voix et les pauses.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VITESSE = 150 * 0.85;
const args = process.argv.slice(2);
const tirage = Number(args.find((a) => a.startsWith("--tirage="))?.split("=")[1] ?? 0);
const dossiers = args.filter((a) => !a.startsWith("--"));
const med = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const p90 = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(0.9 * s.length))] : null; };
const sec = (ms) => ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`;

function attente(times) {
  if (!times?.length) return null;
  let fin = times[0].ms;
  let total = 0, max = 0;
  for (const t of times) {
    const att = Math.max(0, t.ms - fin);
    total += att; max = Math.max(max, att);
    fin = Math.max(t.ms, fin) + (t.words / VITESSE) * 60_000;
  }
  return { total, max };
}

for (const d of dossiers) {
  const rapport = JSON.parse(readFileSync(join(d, "rapport.json"), "utf8"));
  const rs = rapport.results.filter((r) => !tirage || r.round === tirage);
  const intact = rs.filter((r) => r.outcome === "complète" && r.valid && !r.lost.length).length;
  const att = rs.map((r) => attente(r.sliceTimes)).filter(Boolean);
  const rev = rs.map((r) => r.review).filter(Boolean);
  const msRev = rev.flatMap((r) => r.ms);
  console.log(`\n## ${d}${tirage ? ` (tirage ${tirage})` : ""}`);
  console.log(`Leçons intactes : ${intact}/${rs.length}`);
  console.log(`Issues : ${JSON.stringify(rs.reduce((o, r) => ({ ...o, [r.outcome]: (o[r.outcome] ?? 0) + 1 }), {}))}`);
  console.log(`1re tranche médiane / p90 / max : ${sec(med(rs.map((r) => r.firstSliceMs).filter((v) => v != null)))} / ${sec(p90(rs.map((r) => r.firstSliceMs).filter((v) => v != null)))} / ${sec(Math.max(...rs.map((r) => r.firstSliceMs ?? 0)))}`);
  console.log(`Total médian / p90 / max : ${sec(med(rs.map((r) => r.ms)))} / ${sec(p90(rs.map((r) => r.ms)))} / ${sec(Math.max(...rs.map((r) => r.ms)))}`);
  console.log(`Appels au modèle qui écrit : ${rs.reduce((s, r) => s + r.calls, 0)}`);
  if (att.length) {
    console.log(`Attente estimée de l'élève après la 1re tranche : leçons qui attendent ${att.filter((a) => a.max > 500).length}/${att.length} ; attente totale médiane ${sec(med(att.map((a) => a.total)))}, max ${sec(Math.max(...att.map((a) => a.total)))} ; plus longue pause ${sec(Math.max(...att.map((a) => a.max)))}`);
  }
  if (rev.length) {
    const fixes = rev.reduce((s, r) => s + r.fixes, 0);
    console.log(`Relectures : ${rev.reduce((s, r) => s + r.calls, 0)} appels, ${sec(med(msRev))} médian, ${sec(p90(msRev))} p90, ${sec(Math.max(...msRev))} max ; échecs ${rev.reduce((s, r) => s + r.failed, 0)}`);
    console.log(`Alertes gardées ${rev.reduce((s, r) => s + r.alerts, 0)}, écartées ${rev.reduce((s, r) => s + r.dropped, 0)} ; tranches renvoyées ${fixes} dans ${rev.filter((r) => r.fixes).length} leçons`);
    console.log(`Leçons corrigées : ${rs.filter((r) => r.review?.fixes).map((r) => `${r.id}#${r.round}`).join(", ")}`);
  }
}
