#!/usr/bin/env node
/**
 * Comparaison locale et simulée des lecteurs, sans appel au modèle ni service vocal.
 * Démarrer d'abord l'application locale en mode démonstration, puis :
 *   node tools/eval/comparer-formats-ui.mjs
 *   node tools/eval/comparer-formats-ui.mjs --show
 * CHROME_PATH permet d'utiliser un navigateur existant ; NESALIO_URL doit être local.
 * Les délais ne mesurent ni les modèles ni la synthèse vocale réelle.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const url = new URL(process.env.NESALIO_URL || "http://localhost:3000/");
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("Ce test simulé doit viser un serveur local.");
const candidates = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", chromium.executablePath()].filter(Boolean);
const executablePath = candidates.find((path) => existsSync(path));
if (!executablePath) throw new Error("Navigateur Chromium introuvable : définir CHROME_PATH ou installer Playwright Chromium.");

const scenarios = [
  { name: "triangle", question: "Explique un triangle rectangle", parts: [
    { say: "Voici le triangle.", marker: "tri", do: [{ type: "triangle", id: "tri", base: 4, height: 3 }] },
    { say: "Voici son hypoténuse.", do: [{ type: "highlight", target: "tri-hyp" }] },
  ] },
  { name: "parabole", question: "Explique une parabole", parts: [
    { say: "Voici la parabole.", marker: "f", do: [{ type: "axes", x: [-1, 5], y: [-3, 4] }, { type: "curve", id: "f", fn: "-(x-2)^2+3", color: "blue" }] },
    { say: "Voici son sommet.", marker: "sommet", do: [{ type: "point", id: "sommet", at: [2, 3], label: "(2, 3)", color: "violet" }] },
  ] },
];

const browser = await chromium.launch({ executablePath, headless: !process.argv.includes("--show"), args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
let failures = 0;
try {
  for (const scenario of scenarios) for (const mode of ["legacy", "segmented"]) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
        getVoices: () => [], addEventListener: () => {}, cancel: () => {},
        speak: (utterance) => { setTimeout(() => utterance.onstart?.(), 20); setTimeout(() => utterance.onend?.(), 3000); },
      } });
    });
    await page.route("**/api/voice", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    const parts = scenario.parts.map(({ marker: _marker, ...part }) => part);
    const steps = mode === "legacy"
      ? scenario.parts.map(({ marker, ...part }, i) => ({ kind: "step", ...(i === 0 ? { zone: "example" } : {}), ...part,
        ...(marker ? { cues: { [marker]: (part.say.length - 1) / part.say.length } } : {}) }))
      : [{ kind: "step", zone: "example", segments: parts }];
    await page.route("**/api/tutor", (route) => route.fulfill({ status: 200, contentType: "application/x-ndjson", body: [
      { kind: "source", source: "model" }, { kind: "lesson", title: `Comparaison : ${scenario.name}` }, ...steps,
      { kind: "end", reason: "pause", summary: ["Fin de l'essai simulé"] },
    ].map(JSON.stringify).join("\n") + "\n" }));
    try {
      await page.goto(url.href, { waitUntil: "networkidle", timeout: 60000 });
      const input = page.locator('form[data-size="large"] input');
      await input.fill(scenario.question);
      await page.getByRole("button", { name: "Demander à Nesa" }).click();
      await page.getByText(parts[0].say, { exact: false }).first().waitFor({ timeout: 30000 });
      const start = Date.now();
      await page.getByText(parts[1].say, { exact: false }).first().waitFor({ timeout: 30000 });
      const canvas = await page.locator("canvas").count();
      const row = { scenario: scenario.name, format: mode, firstVisible: true, secondVisible: true, canvas, delayMs: Date.now() - start, errors };
      if (!canvas || errors.length) failures++;
      console.log(JSON.stringify(row));
    } catch (error) {
      failures++;
      console.log(JSON.stringify({ scenario: scenario.name, format: mode, error: error.message, browserErrors: errors }));
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
if (failures) process.exitCode = 1;
