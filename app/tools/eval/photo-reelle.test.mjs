/** PHOTO_REELLE=1 npx vitest run tools/eval/photo-reelle.test.mjs. Appels payants, ignorés normalement. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readExercisePhoto, UnreadablePhoto } from "@/server/ai/photo";

const equation = `<text x="70" y="100">Résous l'équation suivante.</text>
  <text x="140" y="240">3x − 5</text><path d="M120 265H360" stroke="black" stroke-width="3"/>
  <text x="210" y="330">4</text><text x="420" y="280">=</text>
  <text x="550" y="240">7</text><path d="M520 265H650" stroke="black" stroke-width="3"/>
  <text x="550" y="330">2</text>`;
const chemistry = `<text x="65" y="100">Réactif limitant</text>
  <text x="65" y="210">N₂ + 3 H₂ → 2 NH₃</text>
  <text x="65" y="300">On mélange 5 mol de N₂ et 6 mol de H₂.</text>
  <text x="65" y="390">Quel réactif est limitant ?</text>`;
const geometry = `<text x="60" y="80">ABC est rectangle en B. Calcule AC.</text>
  <path d="M140 200V500H540Z" fill="none" stroke="black" stroke-width="4"/>
  <path d="M140 470H170V500" fill="none" stroke="black" stroke-width="3"/>
  <text x="100" y="180">A</text><text x="100" y="550">B</text><text x="550" y="550">C</text>
  <text x="35" y="370">3 cm</text><text x="280" y="560">4 cm</text>`;
const concept = `<text x="60" y="100">La fonction affine</text>
  <text x="60" y="200">Une fonction affine s'écrit f(x) = ax + b.</text>
  <text x="60" y="300">a représente la pente de la droite.</text>
  <text x="60" y="400">b est l'ordonnée à l'origine.</text>`;
const corpus = [
  { id: "fraction", svg: equation, checks: [/3\s*x|3x/, /5/, /7/, /2/] },
  { id: "chimie", svg: chemistry, checks: [/5\s*mol/, /6\s*mol/, /N[₂2]|N_?\{?2/, /H[₂2]|H_?\{?2/] },
  { id: "figure", svg: geometry, checks: [/rectangle.*B|B.*rectangle/i, /3\s*cm/, /4\s*cm/] },
  { id: "notion", svg: concept, checks: [/affine/i, /ax\s*\+\s*b/, /pente/i, /origine/i] },
  { id: "vide", svg: "", unreadable: true },
];

describe.runIf(process.env.PHOTO_REELLE === "1")("photos scolaires synthétiques, vrais modèles", () => {
  it("lit les formules et figures, refuse une image vide, et mesure délai et usage", { timeout: 240_000 }, async () => {
    process.loadEnvFile(".env.local");
    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (!token) throw new Error("Aucun identifiant AI Gateway disponible.");
    const sharp = (await import("sharp")).default;
    const models = (process.env.PHOTO_MODELES || "anthropic/claude-haiku-5.5,google/gemini-3.1-flash-lite").split(",");
    const out = join(process.cwd(), "..", "analyses", "photos-2026-11-10");
    mkdirSync(out, { recursive: true });
    const report = [];
    for (const sample of corpus) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="700"><rect width="1100" height="700" fill="white"/><g fill="black" font-family="sans-serif" font-size="40">${sample.svg}</g></svg>`;
      const bytes = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
      writeFileSync(join(out, `${sample.id}.jpg`), bytes);
      for (const model of models) {
        const entry = { sample: sample.id, model, ms: 0 };
        const start = Date.now();
        try {
          const reading = await readExercisePhoto({
            token,
            model,
            image: bytes.toString("base64"),
            signal: AbortSignal.timeout(35_000),
            fetchImpl: async (...args) => {
              const response = await fetch(...args);
              const payload = await response.clone().json();
              entry.status = response.status;
              entry.usage = payload.usage;
              return response;
            },
          });
          entry.reading = reading;
          entry.passed = !sample.unreadable && sample.checks.every((check) => check.test(reading.text));
        } catch (error) {
          entry.error = error instanceof UnreadablePhoto ? "illisible" : error.message;
          entry.passed = !!sample.unreadable && error instanceof UnreadablePhoto;
        }
        entry.ms = Date.now() - start;
        report.push(entry);
        writeFileSync(join(out, "rapport.json"), JSON.stringify(report, null, 2));
        console.log(
          JSON.stringify({ sample: entry.sample, model, status: entry.status, ms: entry.ms, passed: entry.passed, error: entry.error, usage: entry.usage }),
        );
        // Account refusal cannot be repaired by trying further images or models.
        if ([401, 402, 403].includes(entry.status)) throw new Error(`Accès Gateway refusé (${entry.status}).`);
      }
    }
    expect(report.every((entry) => entry.passed)).toBe(true);
  });
});
