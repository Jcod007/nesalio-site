/**
 * Lève l'aveugle : lit les notes « ## <id> » / « - **A : n/100.** » des lots et la clé, compare avant/après.
 * Usage : node analyses/relecture/depouiller.mjs <dossier notation> <clé.json> <corpus.json>
 */
import fs from "node:fs";
import path from "node:path";

const [dossier, cleFile, corpusFile] = process.argv.slice(2);
const cle = JSON.parse(fs.readFileSync(cleFile, "utf8"));
const corpus = JSON.parse(fs.readFileSync(corpusFile, "utf8")).questions;
const notes = {};
for (const f of fs.readdirSync(dossier).filter((f) => /^notes-lot-.\.md$/.test(f))) {
  let id = null;
  for (const ligne of fs.readFileSync(path.join(dossier, f), "utf8").split(/\r?\n/)) {
    const h = /^##\s+(?:ap-)?(\S+)/.exec(ligne);
    if (h) { id = h[1].startsWith("ap3-") ? h[1] : `ap-${h[1].replace(/^ap-/, "")}`; continue; }
    const n = /^-\s+\*\*([AB])\s*:\s*(\d+(?:[.,]\d+)?)\s*\/\s*100/.exec(ligne);
    if (id && n) (notes[id] ??= {})[n[1]] = Number(n[2].replace(",", "."));
  }
}
const lignes = [];
for (const q of corpus) {
  const n = notes[q.id] ?? notes[q.id.replace(/^ap-/, "")];
  const k = cle[q.id];
  if (!n || n.A == null || n.B == null || !k) { console.log(`manque : ${q.id}`); continue; }
  const avant = k.A === "avant" ? n.A : n.B;
  const apres = k.A === "apres" ? n.A : n.B;
  lignes.push({ id: q.id, discipline: q.discipline, theme: q.theme, avant, apres });
}
const moy = (v) => (v.reduce((s, x) => s + x, 0) / v.length).toFixed(1);
const bilan = (rs, titre) => {
  console.log(`${titre} (${rs.length}) : avant ${moy(rs.map((r) => r.avant))}, après ${moy(rs.map((r) => r.apres))} ; < 50 : ${rs.filter((r) => r.avant < 50).length} contre ${rs.filter((r) => r.apres < 50).length} ; après meilleur ${rs.filter((r) => r.apres > r.avant).length}, avant meilleur ${rs.filter((r) => r.avant > r.apres).length}, égalités ${rs.filter((r) => r.apres === r.avant).length}`);
};
bilan(lignes, "Tout");
export const _l = lignes;
for (const d of new Set(lignes.map((r) => r.theme ?? r.discipline))) bilan(lignes.filter((r) => (r.theme ?? r.discipline) === d), `  ${d}`);
console.log("\nÉcarts ≥ 20 points :");
for (const r of lignes.filter((r) => Math.abs(r.apres - r.avant) >= 20).sort((a, b) => (b.apres - b.avant) - (a.apres - a.avant))) console.log(`  ${r.id} : ${r.avant} → ${r.apres}`);
