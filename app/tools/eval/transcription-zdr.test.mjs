/**
 * Essai réel des modèles de transcription compatibles avec la non-conservation (ZDR), pour
 * remplacer openai/whisper-1 (sans fournisseur ZDR) au micro de l'élève.
 * Ignoré par la suite normale (seul le calcul du taux d'erreur est testé). Coût réel, faible
 * (0,10 à 0,21 $ par heure d'audio). À lancer, avec un jeton du Gateway valide :
 *   TRANSCRIPTION_REELLE=1 TRANSCRIPTION_ENREGISTREMENTS=<dossier> npx vitest run tools/eval/transcription-zdr.test.mjs
 *
 * Le dossier contient des enregistrements de phrases dites en français québécois
 * (.webm, .ogg, .mp4, .m4a, .mp3 ou .wav), chacun avec un .txt du même nom : la phrase exacte.
 * Idéalement des voix d'élèves (avec leur accord), au micro d'un ordinateur ou d'un téléphone,
 * avec des termes de maths et de chimie (« dérivée », « x au carré », « mole », « H₂O »…).
 * Ces enregistrements restent hors du dépôt.
 * TRANSCRIPTION_MODELES (séparés par des virgules) remplace la liste des candidats.
 * Le rapport (texte obtenu, taux d'erreur par mot, durée) est écrit dans TRANSCRIPTION_SORTIE
 * (sinon le dossier temporaire du système). Chaque appel porte les options de vie privée
 * d'audio.ts : un modèle refusé par le filtre ZDR apparaît en erreur (403).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { transcribeAudio, ZDR_TRANSCRIPTION_MODELS } from "@/server/ai/audio";

const CANDIDATES = ZDR_TRANSCRIPTION_MODELS;
const MEDIA_TYPES = { ".webm": "audio/webm", ".ogg": "audio/ogg", ".mp4": "audio/mp4", ".m4a": "audio/x-m4a", ".mp3": "audio/mpeg", ".wav": "audio/wav" };

/** Words compared without case, apostrophe variants or punctuation. */
export function words(text) {
  return text.toLowerCase().normalize("NFC").replace(/[’']/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
}

/** Word error rate: word-level edit distance divided by the reference length. */
export function wordErrorRate(reference, hypothesis) {
  const ref = words(reference);
  const hyp = words(hypothesis);
  if (!ref.length) return hyp.length ? 1 : 0;
  let previous = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const row = [i];
    for (let j = 1; j <= hyp.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[hyp.length] / ref.length;
}

function gatewayToken() {
  const fromEnv = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  return file.match(/^(?:AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)="?([^"\r\n]+)/m)?.[1] ?? null;
}

describe("taux d'erreur par mot", () => {
  it("ignore la casse et la ponctuation, compte substitutions, oublis et ajouts", () => {
    expect(wordErrorRate("La dérivée de x au carré.", "la dérivée de X au carré")).toBe(0);
    expect(wordErrorRate("une mole d'eau", "une molle d'eau")).toBe(0.25);
    expect(wordErrorRate("un deux trois", "un trois")).toBeCloseTo(1 / 3);
    expect(wordErrorRate("un deux", "un deux trois quatre")).toBe(1);
  });
});

describe.runIf(process.env.TRANSCRIPTION_REELLE === "1")("transcription réelle avec non-conservation", () => {
  it("transcrit chaque enregistrement avec chaque candidat", { timeout: 600_000 }, async () => {
    const folder = process.env.TRANSCRIPTION_ENREGISTREMENTS;
    if (!folder || !existsSync(folder)) throw new Error("TRANSCRIPTION_ENREGISTREMENTS doit nommer un dossier d'enregistrements.");
    const token = gatewayToken();
    if (!token) throw new Error("Aucun jeton du Gateway (AI_GATEWAY_API_KEY ou VERCEL_OIDC_TOKEN).");
    const models = process.env.TRANSCRIPTION_MODELES?.split(",").map((m) => m.trim()).filter(Boolean) ?? CANDIDATES;
    const recordings = readdirSync(folder)
      .filter((file) => extname(file).toLowerCase() in MEDIA_TYPES && existsSync(join(folder, `${basename(file, extname(file))}.txt`)));
    expect(recordings.length, "aucun enregistrement accompagné de son .txt").toBeGreaterThan(0);

    const rows = [];
    for (const model of models) {
      for (const file of recordings) {
        const reference = readFileSync(join(folder, `${basename(file, extname(file))}.txt`), "utf8").trim();
        const started = performance.now();
        try {
          const text = await transcribeAudio({
            token, model, mediaType: MEDIA_TYPES[extname(file).toLowerCase()],
            audioBase64: readFileSync(join(folder, file)).toString("base64"),
            signal: AbortSignal.timeout(30_000),
          });
          rows.push({ model, file, ms: Math.round(performance.now() - started), wer: wordErrorRate(reference, text), reference, text });
        } catch (error) {
          rows.push({ model, file, ms: Math.round(performance.now() - started), error: String(error?.message ?? error).slice(0, 300), reference });
        }
      }
    }

    const summary = models.map((model) => {
      const mine = rows.filter((row) => row.model === model);
      const ok = mine.filter((row) => row.error === undefined);
      const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
      return { model, réussis: `${ok.length}/${mine.length}`, erreurParMot: mean(ok.map((row) => row.wer)), msMoyen: mean(ok.map((row) => row.ms)) };
    });
    const out = process.env.TRANSCRIPTION_SORTIE ?? join(tmpdir(), "nesalio-transcription-zdr");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "rapport.json"), JSON.stringify({ date: new Date().toISOString(), summary, rows }, null, 2));
    console.table(summary);
    console.log(`Rapport : ${join(out, "rapport.json")}`);
  });
});
