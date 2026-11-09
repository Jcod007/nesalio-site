#!/usr/bin/env node
/**
 * Vérifie le tableau et la voix segmentés avec des réponses simulées.
 * Démarrer l'application locale, puis lancer ce script avec --show pour voir Chrome.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const url = new URL(process.env.NESALIO_URL || "http://localhost:3000/");
const inspect = process.argv.includes("--inspect");
const replay = inspect && process.argv.includes("--replay");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Ce test doit viser un serveur local.");
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  chromium.executablePath(),
].find((path) => path && existsSync(path));
if (!executablePath) throw new Error("Navigateur Chromium introuvable : définir CHROME_PATH ou installer Playwright Chromium.");

const scenarios = [
  { name: "triangle", question: "Explique un triangle rectangle", parts: [
    { say: "Voici le triangle.", do: [{ type: "triangle", id: "tri", base: 4, height: 3 }] },
    { say: "Voici son hypoténuse.", do: [{ type: "highlight", target: "tri-hyp" }] },
  ] },
  { name: "parabole", question: "Explique une parabole", parts: [
    { say: "Voici la parabole.", do: [{ type: "axes", x: [-1, 5], y: [-3, 4] }, { type: "curve", id: "f", fn: "-(x-2)^2+3", color: "blue" }] },
    { say: "Voici son sommet.", do: [{ type: "point", id: "sommet", at: [2, 3], label: "(2, 3)", color: "violet" }] },
  ] },
];

const browser = await chromium.launch({ executablePath, headless: !process.argv.includes("--show"), args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
let failures = 0;
try {
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.spokenLines = [];
      window.speechControls = [];
      Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
        getVoices: () => [], addEventListener: () => {}, cancel: () => {},
        pause: () => window.speechControls.push("pause"),
        resume: () => window.speechControls.push("resume"),
        speak: (utterance) => {
          window.spokenLines.push(utterance.text);
          setTimeout(() => utterance.onstart?.(), 20);
          setTimeout(() => utterance.onend?.(), 1200);
        },
      } });
    });
    await page.route("**/api/voice", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    const rawStep = JSON.stringify({ kind: "step", segments: scenario.parts, note: "Champ reçu du modèle" });
    const nextLine = "Passons à l’étape suivante.";
    await page.route("**/api/tutor", (route) => {
      requests.push({ body: route.request().postDataJSON(), inspection: route.request().headers()["x-nesalio-inspection"] });
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: [
        { kind: "source", source: "model" }, { kind: "lesson", title: scenario.name },
        ...(inspect ? [{ kind: "trace-step", raw: rawStep }] : []),
        { kind: "step", segments: scenario.parts },
        ...(replay ? [{ kind: "step", segments: [{ say: nextLine, do: [{ type: "note", id: "suite", text: "Étape suivante" }] }] }] : []),
        { kind: "end", reason: "pause", summary: ["Fin de l'essai simulé"] },
      ].map((event) => JSON.stringify(event)).join("\n") + "\n" });
    });
    try {
      await page.goto(url.href, { waitUntil: "networkidle", timeout: 120000 });
      if (inspect) {
        await page.getByRole("link", { name: "Inspecter le JSON" }).click();
        await page.waitForURL((target) => target.searchParams.get("inspect") === "1");
        await page.getByText("Inspection JSON activée.", { exact: true }).waitFor();
      }
      await page.locator('[aria-label="Tableau de Nesa"][data-ready="true"]').waitFor({ timeout: 60000 });
      await page.locator('form[data-size="large"] input').fill(scenario.question);
      await page.getByRole("button", { name: "Demander à Nesa" }).click();
      const dock = page.getByRole("region", { name: "Nesa", exact: true });
      let held = true;
      if (inspect) {
        const panel = page.getByRole("complementary", { name: "Inspection du JSON" });
        const model = panel.getByRole("region", { name: "Modèle brut" }).locator("pre");
        const server = panel.getByRole("region", { name: "JSON traité par le serveur" }).locator("pre");
        await panel.getByRole("heading", { name: "Segment 1 / 2 de l’étape" }).waitFor();
        await panel.getByRole("button", { name: "Pause", exact: true }).click();
        const clip = { x: 20, y: 82, width: 700, height: 360 };
        const before = await page.screenshot({ clip });
        await page.waitForTimeout(1800);
        const after = await page.screenshot({ clip });
        held = before.equals(after)
          && await panel.getByRole("heading", { name: "Segment 1 / 2 de l’étape" }).isVisible()
          && await model.textContent() === rawStep
          && !Object.hasOwn(JSON.parse(await server.textContent()), "note")
          && await page.evaluate(() => window.spokenLines.length === 1 && window.speechControls.includes("pause"));
        await panel.getByRole("button", { name: "Reprendre", exact: true }).click();
      }
      let replayed = true;
      if (replay) {
        await dock.getByText(nextLine, { exact: false }).first().waitFor();
        const panel = page.getByRole("complementary", { name: "Inspection du JSON" });
        await panel.getByRole("button", { name: "Pause", exact: true }).click();
        const liveClip = { x: 20, y: 82, width: 700, height: 360 };
        const liveBoard = await page.screenshot({ clip: liveClip });
        await panel.getByRole("button", { name: "Étape précédente" }).click();
        await panel.getByRole("heading", { name: "Étape 1 / 2 · Rejeu" }).waitFor();
        const raw = await panel.getByRole("region", { name: "Modèle brut" }).locator("pre").textContent();
        await panel.getByRole("button", { name: "Rejouer l’étape" }).click();
        await page.locator('[aria-label="Rejeu de l’étape"][data-status="done"]').waitFor();
        const spoken = await page.evaluate(() => window.spokenLines);
        replayed = raw === rawStep && requests.length === 1
          && JSON.stringify(spoken.slice(-2)) === JSON.stringify(scenario.parts.map((part) => part.say));
        await panel.getByRole("button", { name: "Retour au direct" }).click();
        await panel.getByRole("heading", { name: "Segment 1 / 1 de l’étape" }).waitFor();
        replayed &&= liveBoard.equals(await page.screenshot({ clip: liveClip }));
        await panel.getByRole("button", { name: "Reprendre", exact: true }).click();
      } else {
        await dock.getByText(scenario.parts[1].say, { exact: false }).first().waitFor();
      }
      await dock.getByText("Fin de l'essai simulé", { exact: true }).waitFor();
      const oneRequest = requests.length === 1 && requests[0].body.question === scenario.question
        && !("stepFormat" in requests[0].body) && requests[0].inspection === (inspect ? "1" : undefined);
      const canvas = await page.locator("main canvas").count();
      const spokenLines = await page.evaluate(() => window.spokenLines);
      const expected = scenario.parts.map((part) => part.say);
      const inOrder = JSON.stringify(spokenLines) === JSON.stringify(replay ? [...expected, nextLine, ...expected] : expected);
      if (!oneRequest || canvas !== 1 || !inOrder || !held || !replayed || errors.length) failures++;
      console.log(JSON.stringify({ scenario: scenario.name, oneRequest, canvas, inOrder, ...(inspect ? { held } : {}), ...(replay ? { replayed } : {}), errors }));
    } catch (error) {
      failures++;
      console.log(JSON.stringify({ scenario: scenario.name, error: error.message, browserErrors: errors }));
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
if (failures) process.exitCode = 1;
