/**
 * Essai hors ligne du relecteur (piste P6) : relit les 90 leçons Alloprof déjà notées à l'aveugle.
 * Usage (depuis n'importe où) :
 *   node analyses/relecture/relire.mjs <reglage> [ids séparés par des virgules]
 * Réglages : flash-low (DeepSeek V4.1 Flash, réflexion low), sonnet (Claude Sonnet 5.5, réflexion low),
 *            sonnet-none (Claude Sonnet 5.5 sans réflexion).
 * Clé lue dans app/.env.local (jamais affichée). Protection des données comme chatCompletions.ts :
 * providerOptions.gateway { zeroDataRetention, disallowPromptTraining }.
 * Sortie : analyses/relecture/<reglage>/<id>.json
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, "..", "..");
const NOTES = process.env.NOTES_DIR
  ?? "C:/Users/compt2/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/side-session-notes/local_3a01ca48-a687-4e6c-8440-e337b02675f8/notation-alloprof";

const REGLAGES = {
  "flash-low": { model: "deepseek/deepseek-v4.1-flash", effort: "low", prix: [0.3, 1.2] },
  "sonnet": { model: "anthropic/claude-sonnet-5.5", effort: "low", prix: [2, 10] },
  "sonnet-none": { model: "anthropic/claude-sonnet-5.5", effort: "none", prix: [2, 10] },
};

function cle() {
  const file = readFileSync(join(RACINE, "app", ".env.local"), "utf8");
  const k = file.match(/^AI_GATEWAY_API_KEY="?([^"\r\n]+)/m)?.[1] ?? file.match(/^VERCEL_OIDC_TOKEN="?([^"\r\n]+)/m)?.[1];
  if (!k) throw new Error("Pas de clé Gateway dans app/.env.local");
  return k.trim();
}

const GARDER = /^\s{4}(transform|move|set_style)\b/;
/** Texte lisible sans note, référence ni gestes d'animation (show, highlight…). */
export function lisible(brut) {
  const lignes = brut.split(/\r?\n/);
  const question = lignes.find((l) => l.startsWith("QUESTION DE L'ÉLÈVE"))?.replace(/^QUESTION DE L'ÉLÈVE : /, "") ?? "";
  const debut = lignes.findIndex((l) => l.startsWith("TITRE"));
  const corps = lignes.slice(debut).filter((l) => !/^\s{4}\S/.test(l) || GARDER.test(l));
  return { question, lecon: corps.join("\n").trim() };
}

const SYSTEME = `Tu es relecteur scientifique pour un tuteur de maths et de chimie (secondaire 4-5, Québec).
On te donne la question d'un élève et une leçon : ce que la tutrice DIT (lignes « DIT ») et ce qu'elle affiche au tableau (lignes « OBJET » : formules, tableaux [matrix] avec rows/row_labels/column_labels, points, courbes, polygones, étiquettes).
Ta tâche : trouver les ERREURS DE FOND CERTAINES, et seulement celles-là :
- calcul faux, comptage faux, valeur fausse ;
- fait scientifique ou définition faux ;
- tableau, figure, point ou étiquette qui contredit les nombres ou ce qui est dit ;
- énoncé de l'élève mal lu, ou réponse qui ne répond pas à SA question ;
- raisonnement qui se contredit (la conclusion contredit le corps).
Refais toi-même chaque calcul avant de signaler. Ne signale PAS : le style, la pédagogie, un oubli, une simplification acceptable au secondaire, un arrondi raisonnable, un objet simplement mal placé, un doute. En cas de doute, ne signale rien. Une leçon juste doit recevoir une liste vide.
Réponds UNIQUEMENT en JSON, sans texte autour :
{"erreurs":[{"citation":"extrait exact copié de la leçon","correction":"ce qui est juste, en une phrase","type":"calcul|fait|tableau|figure|enonce|raisonnement"}]}
Au plus 4 erreurs, les plus graves d'abord. Liste vide si aucune erreur certaine : {"erreurs":[]}`;

function fichiers() {
  const out = [];
  for (const lot of ["lot-a", "lot-b", "lot-c"]) {
    for (const f of readdirSync(join(NOTES, lot))) if (f.endsWith(".txt")) out.push({ id: f.replace(/^ap-|\.txt$/g, ""), chemin: join(NOTES, lot, f) });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function parseJson(texte) {
  const t = texte.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch { /* cherche le premier objet */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* illisible */ } }
  return null;
}

async function relire(reglage, item, key) {
  const { question, lecon } = lisible(readFileSync(item.chemin, "utf8"));
  const body = {
    model: reglage.model,
    messages: [
      { role: "system", content: SYSTEME },
      { role: "user", content: `QUESTION DE L'ÉLÈVE :\n${question}\n\nLEÇON :\n${lecon}` },
    ],
    max_tokens: 12000,
    ...(reglage.effort !== "none" ? { reasoning: { effort: reglage.effort } } : {}),
    providerOptions: { gateway: { zeroDataRetention: true, disallowPromptTraining: true } },
  };
  const t0 = Date.now();
  let lastErr;
  for (let essai = 0; essai < 3; essai++) {
    try {
      const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const txt = await r.text();
      if (r.status === 402) { console.error("402 : budget de la clé dépassé, arrêt."); process.exit(2); }
      if (!r.ok) throw new Error(`HTTP ${r.status} ${txt.slice(0, 300)}`);
      const data = JSON.parse(txt);
      const contenu = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage ?? {};
      const entree = usage.prompt_tokens ?? 0;
      const sortie = usage.completion_tokens ?? 0;
      return {
        id: item.id, model: reglage.model, effort: reglage.effort, ms: Date.now() - t0,
        usage, coutEstime: (entree * reglage.prix[0] + sortie * reglage.prix[1]) / 1e6,
        brut: contenu, resultat: parseJson(contenu), finish: data.choices?.[0]?.finish_reason,
      };
    } catch (e) { lastErr = e; await new Promise((res) => setTimeout(res, 2000 * (essai + 1))); }
  }
  return { id: item.id, model: reglage.model, erreur: String(lastErr?.message ?? lastErr), ms: Date.now() - t0 };
}

async function main() {
  const nom = process.argv[2];
  const reglage = REGLAGES[nom];
  if (!reglage) throw new Error(`Réglage inconnu : ${nom}`);
  const seuls = process.argv[3]?.split(",").filter(Boolean);
  const items = fichiers().filter((i) => !seuls || seuls.includes(i.id));
  const dossier = join(ICI, nom);
  mkdirSync(dossier, { recursive: true });
  const key = cle();
  const file = items.filter((i) => process.env.FORCER === "1" || !existsSync(join(dossier, `${i.id}.json`)));
  const PAR = Number(process.env.PARALLELE ?? 6);
  let total = 0;
  async function ouvrier() {
    while (file.length) {
      const item = file.shift();
      const res = await relire(reglage, item, key);
      writeFileSync(join(dossier, `${item.id}.json`), JSON.stringify(res, null, 2));
      total += res.coutEstime ?? 0;
      console.log(item.id, res.erreur ? `ERREUR ${res.erreur.slice(0, 120)}` : `${res.ms} ms, ${res.resultat?.erreurs?.length ?? "?"} alertes, ${res.usage?.prompt_tokens}/${res.usage?.completion_tokens} jetons`);
    }
  }
  await Promise.all(Array.from({ length: PAR }, ouvrier));
  console.log(`Coût estimé de ce passage : ${total.toFixed(4)} $`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
