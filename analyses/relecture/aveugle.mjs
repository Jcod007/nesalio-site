/**
 * Dossiers de notation à l'aveugle : pour chaque question, deux versions A/B (ordre tiré au hasard,
 * graine fixe), 3 lots. La clé est écrite à part.
 * Usage : node analyses/relecture/aveugle.mjs <corpus.json> <banc avant> <banc après> <dossier sortie> <clé.json> [tirage=1]
 * Corrigé le 2026-11-09 : la réponse de référence s'affiche par `reponse.texte` (avant : « [object Object] »).
 */
import fs from "node:fs";
import path from "node:path";

const [corpusFile, avant, apres, sortie, cleFile, tirage = "1"] = process.argv.slice(2);
const corpus = JSON.parse(fs.readFileSync(corpusFile, "utf8"));
const questions = corpus.questions.filter((q) => q.discipline !== "physique" && !q.horsPerimetre);
const lecon = (dossier, id) => {
  const f = path.join(dossier, `${id}-t${tirage}.lisible.txt`);
  if (!fs.existsSync(f)) return "(aucune explication produite)";
  const t = fs.readFileSync(f, "utf8");
  const i = t.indexOf("TITRE :");
  return i >= 0 ? t.slice(i) : "(aucune explication produite)";
};
const reference = (q) => typeof q.reponse === "string" ? q.reponse : q.reponse?.texte ?? "—";
let graine = 20261109;
const hasard = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
const cle = {};
questions.forEach((q, n) => {
  const dossier = path.join(sortie, ["lot-a", "lot-b", "lot-c"][n % 3]);
  fs.mkdirSync(dossier, { recursive: true });
  const tete = [`QUESTION DE L'ÉLÈVE : ${q.question}`, `RÉPONSE DE RÉFÉRENCE : ${reference(q)}`, "ATTENDUS À COCHER :",
    ...(q.attendus ?? []).map((a, i) => `  ${i + 1}. ${typeof a === "string" ? a : JSON.stringify(a)}`)].join("\n");
  let v = [{ qui: "avant", texte: lecon(avant, q.id) }, { qui: "apres", texte: lecon(apres, q.id) }];
  if (hasard() < 0.5) v = v.reverse();
  cle[q.id] = {};
  v.forEach((x, i) => {
    const L = "AB"[i];
    cle[q.id][L] = x.qui;
    fs.writeFileSync(path.join(dossier, `${q.id}-${L}.txt`), `${tete}\n\nVERSION ${L}\n\n${x.texte}\n`);
  });
});
fs.writeFileSync(cleFile, JSON.stringify(cle, null, 2));
console.log(Object.keys(cle).length, "questions");
