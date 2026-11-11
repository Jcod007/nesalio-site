/**
 * Compare plusieurs vitesses de la voix Nesalio sur la même phrase (vrai appel,
 * coût faible) : durée du clip, horodatages toujours exacts, MP3 à écouter.
 *   VOIX_VITESSE=1 npx vitest run tools/eval/voix-vitesse.test.mjs
 * Écrit dans ../analyses/voix-vitesse/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { synthesizeSpeech } from "@/server/ai/audio";
import { DEFAULTS } from "@/server/config";
import { alignBeatCues } from "@/domain/nesalio/alignment";

const SAY = "Prenons l'équation trois x plus cinq égale dix-sept. Pour isoler x, on enlève cinq des deux côtés : il reste trois x égale douze.";
const CUES = [
  { id: "eq", text: "trois x plus cinq" },
  { id: "isoler", text: "isoler" },
  { id: "douze", text: "douze" },
];

function gatewayToken() {
  const fromEnv = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return readFileSync(new URL("../../.env.local", import.meta.url), "utf8").match(/^(?:AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)="?([^"\r\n]+)/m)?.[1];
}

describe.runIf(process.env.VOIX_VITESSE === "1")("vitesse de la voix Nesalio", () => {
  it("génère la même phrase à plusieurs vitesses", { timeout: 300_000 }, async () => {
    const out = join(process.cwd(), "../analyses/voix-vitesse");
    mkdirSync(out, { recursive: true });
    const rows = [];
    for (const speed of [undefined, 0.9, 0.85, 0.8]) {
      const { audio, alignment } = await synthesizeSpeech({
        token: gatewayToken(),
        model: DEFAULTS.nesalioVoiceModel,
        text: SAY,
        withTimestamps: true,
        speed,
      });
      const name = `vitesse-${speed ?? "1.0"}.mp3`;
      writeFileSync(join(out, name), audio);
      const timings = alignment ? alignBeatCues({ say: SAY, cues: CUES }, alignment) : new Map();
      rows.push({
        speed: speed ?? 1,
        file: name,
        durationMs: alignment ? Math.round(alignment.characterEndTimesSeconds.at(-1) * 1000) : null,
        sameText: alignment ? alignment.characters.join("") === SAY : false,
        cues: Object.fromEntries([...timings].map(([id, t]) => [id, t.start])),
      });
    }
    writeFileSync(join(out, "rapport.json"), JSON.stringify(rows, null, 2));
    console.log(JSON.stringify(rows, null, 2));
  });
});
