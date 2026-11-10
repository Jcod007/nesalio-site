#!/usr/bin/env node
/**
 * Joue des leçons Nesalio sur /dev/nesalio (voix simulée : même rythme, sans son, sans frais de voix) et garde
 * une capture du tableau toutes les 5 secondes, avec ce que la voix dit à ce moment : pour juger à l'œil ce que
 * l'élève voit (cadrage, contenu, accord voix/tableau). Le serveur de développement doit déjà tourner.
 *
 *   node tools/eval/captures-nesalio.mjs <travaux.json>
 *
 * travaux.json : [{ "name": "x", "lesson": "chemin/vers/lecon.json" } | { "name": "y", "question": "…" }]
 * (une question lance une vraie génération : coût des modèles). Variables : PARALLELE (défaut 3), PAS_MS (5000).
 * Sorties : analyses/captures/<name>/t000.jpg, t005.jpg… et passages.json (voix, avertissements, erreurs).
 */
import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const jobs = JSON.parse(readFileSync(resolve(process.argv[2] ?? ""), "utf8"));
const url = new URL(process.env.NESALIO_URL || "http://localhost:3000/dev/nesalio?voix=simulee");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Ce script doit viser un serveur local.");
const launch = JSON.parse(readFileSync(join(root, ".claude/launch.json"), "utf8"));
const token = process.env.NESALIO_DEV_ACCESS_TOKEN ?? launch.configurations.map((entry) => entry.env?.NESALIO_DEV_ACCESS_TOKEN).find(Boolean);
if (!token) throw new Error("NESALIO_DEV_ACCESS_TOKEN introuvable.");
const cookie = createHmac("sha256", token).update("nesalio-development-access-v1").digest("hex");
const STEP = Number(process.env.PAS_MS ?? 5000);
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((path) => path && existsSync(path));
const browser = await chromium.launch({ executablePath, args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader"] });

async function play(job) {
  const out = join(root, "analyses/captures", job.name);
  mkdirSync(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 980 } });
  await context.addCookies([{ name: "nesalio_dev", value: cookie, url: url.origin }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("#nesalio-lesson:not([disabled])", { timeout: 60_000 });
  await page.waitForTimeout(1500);
  if (job.lesson) {
    await page.setInputFiles("#nesalio-lesson", resolve(root, job.lesson));
    await page.getByRole("button", { name: "Lire la leçon" }).click();
  } else {
    await page.fill("#nesalio-question", job.question);
    await page.getByRole("button", { name: "Générer et lire" }).click();
  }
  const started = Date.now();
  const passages = [];
  const shots = [];
  let caption = "", nextShot = 0, status = "";
  const limit = started + 8 * 60_000;
  for (;;) {
    status = (await page.getByRole("status").textContent().catch(() => "")) ?? "";
    const text = (await page.locator("main p[aria-live=polite]").textContent().catch(() => "")) ?? "";
    const elapsed = Date.now() - started;
    if (text && text !== caption) {
      caption = text;
      passages.push({ at: +(elapsed / 1000).toFixed(1), say: text });
    }
    const ended = /terminée/.test(status) || (await page.locator("main p[role=alert]").count()) > 0 || Date.now() > limit;
    if (elapsed >= nextShot || ended) {
      const canvas = page.locator("canvas").first();
      if (await canvas.count()) {
        const file = `t${String(Math.round(elapsed / 1000)).padStart(3, "0")}.jpg`;
        await canvas.screenshot({ path: join(out, file), type: "jpeg", quality: 70 }).catch(() => undefined);
        shots.push({ file, at: +(elapsed / 1000).toFixed(1), say: caption });
      }
      nextShot += STEP;
    }
    if (ended) break;
    await page.waitForTimeout(100);
  }
  const alert = (await page.locator("main p[role=alert]").count()) ? await page.locator("main p[role=alert]").textContent() : null;
  const warnings = await page.locator("ul[aria-label='Avertissements de lecture'] li").allTextContents().catch(() => []);
  writeFileSync(join(out, "passages.json"), JSON.stringify({ job, status, alert, warnings, errors, seconds: Math.round((Date.now() - started) / 1000), passages, shots }, null, 1));
  await context.close();
  console.log(`${job.name} : ${status}${alert ? ` — ALERTE ${alert}` : ""} (${shots.length} captures, ${warnings.length} avertissements, ${errors.length} erreurs)`);
}

const queue = [...jobs];
await Promise.all(Array.from({ length: Number(process.env.PARALLELE ?? 3) }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try { await play(job); } catch (error) { console.log(`${job.name} : ÉCHEC ${String(error).slice(0, 200)}`); }
  }
}));
await browser.close();
