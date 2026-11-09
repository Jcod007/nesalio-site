#!/usr/bin/env node
/**
 * Extrait SEULEMENT les questions posées par les élèves dans les séances enregistrées
 * (stockage Vercel Blob), pour en faire un banc d'évaluation. Rien d'autre ne sort :
 * ni nom, ni courriel, ni réponse, ni identifiant de séance.
 *
 * À lancer par l'utilisateur, dans app/ (le jeton ne passe jamais par l'IA) :
 *   vercel env pull .env.seances --environment=development
 *   node tools/eval/questions-seances.mjs .env.seances
 *   (puis supprimer .env.seances)
 * Écrit ../analyses/seances-questions.json : [{ jour, mode, question }], sans doublons.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { list } from "@vercel/blob";

const envFile = process.argv[2] ?? ".env.seances";
const token = readFileSync(envFile, "utf8").match(/^BLOB_READ_WRITE_TOKEN="?([^"\r\n]+)/m)?.[1];
if (!token) throw new Error(`BLOB_READ_WRITE_TOKEN absent de ${envFile}.`);

const questions = new Map();
for (const env of ["production", "preview"]) {
  let cursor;
  do {
    const page = await list({ token, prefix: `${env}/`, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      const response = await fetch(blob.downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) continue;
      const turn = await response.json().catch(() => null);
      if (!turn || turn.mode === "continue" || typeof turn.question !== "string" || !turn.question.trim()) continue;
      const question = turn.question.trim().slice(0, 300);
      if (!questions.has(question)) questions.set(question, { jour: blob.pathname.split("/")[1], mode: turn.mode, question });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}
const out = [...questions.values()].sort((a, b) => a.jour.localeCompare(b.jour));
writeFileSync(new URL("../../../analyses/seances-questions.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`${out.length} questions distinctes écrites dans analyses/seances-questions.json`);
