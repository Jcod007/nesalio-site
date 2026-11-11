/**
 * Banc réel de la voix Nesalio : appelle vraiment ElevenLabs via le Gateway
 * (coût réel, faible) et vérifie que chaque repère obtient une heure exacte.
 * Ignoré par la suite normale ; à lancer avec :
 *   VOIX_REELLE=1 npx vitest run tools/eval/voix-reelle.test.mjs
 * Les clips et le rapport sont écrits dans VOIX_REELLE_SORTIE (sinon tools/eval/sortie-voix).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { synthesizeSpeech } from "@/server/ai/audio";
import { DEFAULTS } from "@/server/config";
import { alignBeatCues, cueOffset } from "@/domain/nesalio/alignment";

/** Phrases choisies pour leurs pièges : élisions, apostrophes, nombres, symboles, répétitions. */
const CORPUS = [
  { say: "Regardons l'hypoténuse du triangle.", cues: [{ id: "c1", text: "hypoténuse" }] },
  { say: "Regardons l’hypoténuse du triangle.", cues: [{ id: "c1", text: "hypoténuse" }] },
  {
    say: "Cinq fois trois font quinze, et cinq plus dix aussi.",
    cues: [
      { id: "c1", text: "Cinq" },
      { id: "c2", text: "cinq" },
      { id: "c3", text: "quinze" },
    ],
  },
  {
    say: "On a 3 + 4 = 7, donc x = 7.",
    cues: [
      { id: "c1", text: "3" },
      { id: "c2", text: "7", occurrence: 2 },
    ],
  },
  {
    say: "Le carré de 25 vaut 625.",
    cues: [
      { id: "c1", text: "25" },
      { id: "c2", text: "625" },
    ],
  },
  {
    say: "Aujourd'hui, on étudie la dérivée de f(x) = x².",
    cues: [
      { id: "c1", text: "dérivée" },
      { id: "c2", text: "x²" },
    ],
  },
  {
    say: "Vingt-cinq est un carré parfait.",
    cues: [
      { id: "c1", text: "Vingt-cinq" },
      { id: "c2", text: "parfait" },
    ],
  },
  {
    say: "Le PGCD de 12 et 18 est 6.",
    cues: [
      { id: "c1", text: "PGCD" },
      { id: "c2", text: "6" },
    ],
  },
  {
    say: "Trace la droite (AB), puis place le point M.",
    cues: [
      { id: "c1", text: "(AB)" },
      { id: "c2", text: "M" },
    ],
  },
  {
    say: "π vaut environ 3,14.",
    cues: [
      { id: "c1", text: "π" },
      { id: "c2", text: "3,14" },
    ],
  },
  {
    say: "La pente vaut −2 : la droite descend.",
    cues: [
      { id: "c1", text: "−2" },
      { id: "c2", text: "descend" },
    ],
  },
  {
    say: "Elle s'allonge… puis elle rétrécit !",
    cues: [
      { id: "c1", text: "s'allonge" },
      { id: "c2", text: "rétrécit" },
    ],
  },
  {
    say: "Un demi, c'est 1/2, soit 0,5 ou 50 %.",
    cues: [
      { id: "c1", text: "1/2" },
      { id: "c2", text: "50 %" },
    ],
  },
  {
    say: "Le côté a mesure 3 cm et le côté b mesure 4 cm.",
    cues: [
      { id: "c1", text: "a" },
      { id: "c2", text: "b" },
    ],
  },
  { say: "Le dernier mot compte.", cues: [{ id: "c1", text: "compte" }] },
  {
    say: "Prenons un triangle rectangle. Appelons ses côtés a, b et c, où c est l'hypoténuse.",
    cues: [
      { id: "c1", text: "côtés" },
      { id: "c2", text: "a" },
      { id: "c3", text: "b" },
      { id: "c4", text: "c", occurrence: 1 },
    ],
    ordered: true,
  },
];

function gatewayToken() {
  const fromEnv = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  return file.match(/^(?:AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)="?([^"\r\n]+)/m)?.[1] ?? null;
}

describe.runIf(process.env.VOIX_REELLE === "1")("voix Nesalio réelle", () => {
  it("donne une heure exacte à chaque repère du corpus", { timeout: 300_000 }, async () => {
    const token = gatewayToken();
    if (!token) throw new Error("Aucun jeton Gateway (AI_GATEWAY_API_KEY ou VERCEL_OIDC_TOKEN).");
    const out = process.env.VOIX_REELLE_SORTIE ?? join(process.cwd(), "tools/eval/sortie-voix");
    mkdirSync(out, { recursive: true });
    const report = [];

    for (const [index, beat] of CORPUS.entries()) {
      for (const cue of beat.cues) expect(cueOffset(beat.say, cue.text, cue.occurrence ?? 1), cue.text).toBeGreaterThanOrEqual(0);
      const entry = { index, say: beat.say };
      try {
        const { audio, mediaType, alignment } = await synthesizeSpeech({
          token,
          model: DEFAULTS.nesalioVoiceModel,
          text: beat.say,
          withTimestamps: true,
        });
        writeFileSync(join(out, `${String(index).padStart(2, "0")}.mp3`), audio);
        entry.mediaType = mediaType;
        entry.bytes = audio.byteLength;
        entry.alignment = Boolean(alignment);
        if (alignment) {
          const returned = alignment.characters.join("");
          entry.sameText = returned === beat.say;
          if (!entry.sameText) entry.returned = returned;
          entry.lastEndMs = Math.round(alignment.characterEndTimesSeconds.at(-1) * 1000);
          entry.zeroLength = alignment.characters.filter((_, i) => alignment.characterEndTimesSeconds[i] <= alignment.characterStartTimesSeconds[i]).length;
          const timings = alignBeatCues(beat, alignment);
          entry.cues = beat.cues.map((cue) => ({ text: cue.text, occurrence: cue.occurrence ?? 1, ...(timings.get(cue.id) ?? { missing: true }) }));
        }
      } catch (error) {
        entry.error = String(error?.message ?? error);
      }
      report.push(entry);
      console.log(JSON.stringify(entry));
    }

    writeFileSync(join(out, "rapport.json"), JSON.stringify({ model: DEFAULTS.nesalioVoiceModel, date: new Date().toISOString(), report }, null, 2));
    const missing = report.flatMap((entry) => (entry.cues ?? []).filter((cue) => cue.missing).map((cue) => `${entry.index}:${cue.text}`));
    const disordered = report
      .filter((entry) => CORPUS[entry.index].ordered && entry.cues && entry.cues.some((cue, i) => i > 0 && !(cue.start > entry.cues[i - 1].start)))
      .map((entry) => entry.index);
    expect(disordered).toEqual([]);
    const broken = report.filter((entry) => entry.error || !entry.alignment || !entry.sameText).map((entry) => entry.index);
    expect({ broken, missing }).toEqual({ broken: [], missing: [] });
  });
});
