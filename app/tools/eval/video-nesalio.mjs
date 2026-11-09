#!/usr/bin/env node
/**
 * Rejoue une leçon Nesalio sur /dev/nesalio et enregistre la lecture en vidéo,
 * pour juger les mouvements de caméra image par image (les captures espacées
 * ne les attrapent pas). Le serveur de développement doit déjà tourner.
 *
 *   node tools/eval/video-nesalio.mjs ../analyses/generations/retour-parabole.json [nom]
 *
 * Sorties dans analyses/videos/ : <nom>.webm, <nom>.passages.json (heure de
 * chaque passage dans la vidéo, avertissements, erreurs de page).
 * Coût réel : la voix de chaque passage est synthétisée.
 */
import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const lesson = resolve(process.argv[2] ?? "");
if (!existsSync(lesson)) throw new Error("Usage : node tools/eval/video-nesalio.mjs <leçon.json> [nom]");
const name = process.argv[3] ?? basename(lesson, ".json");
const url = new URL(process.env.NESALIO_URL || "http://localhost:3000/dev/nesalio");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Ce script doit viser un serveur local.");

// Same development access as the page uses: the cookie is derived from the local test token.
const launch = JSON.parse(readFileSync(join(root, ".claude/launch.json"), "utf8"));
const token = process.env.NESALIO_DEV_ACCESS_TOKEN ?? launch.configurations.map((entry) => entry.env?.NESALIO_DEV_ACCESS_TOKEN).find(Boolean);
if (!token) throw new Error("NESALIO_DEV_ACCESS_TOKEN introuvable (.claude/launch.json ou environnement).");
const cookie = createHmac("sha256", token).update("nesalio-development-access-v1").digest("hex");

const out = join(root, "analyses/videos");
mkdirSync(out, { recursive: true });
const size = { width: 1280, height: 980 };
// The Chrome already on the machine, as verifier-segments-ui.mjs does: no browser download needed.
const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((path) => path && existsSync(path));
const browser = await chromium.launch({ executablePath, args: ["--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: size });
await context.addCookies([{ name: "nesalio_dev", value: cookie, url: url.origin }]);
const page = await context.newPage();
// Frames straight from Chrome, each with its own time: Playwright's recorder needs an ffmpeg build
// that may not be installed, and exact frame times are what a camera move is judged on.
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  frames.push({ at: Date.now(), image: Buffer.from(data, "base64"), stamp: metadata.timestamp });
  void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 2 });
const started = Date.now();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

await page.goto(url.href, { waitUntil: "networkidle" });
await page.setInputFiles("#nesalio-lesson", lesson);
await page.getByRole("button", { name: "Lire la leçon" }).click();

// When each passage starts, in video time: its caption changes.
const passages = [];
let caption = "";
const limit = Date.now() + 10 * 60_000;
for (;;) {
  const status = (await page.getByRole("status").textContent()) ?? "";
  const text = (await page.locator("main p[aria-live=polite]").textContent()) ?? "";
  if (text && text !== caption) {
    caption = text;
    passages.push({ at: (Date.now() - started) / 1000, say: text });
  }
  if (/terminée/.test(status) || (await page.locator("main p[role=alert]").count()) || Date.now() > limit) break;
  await page.waitForTimeout(50);
}
await page.waitForTimeout(1500);
const status = await page.getByRole("status").textContent();
const alert = (await page.locator("main p[role=alert]").count()) ? await page.locator("main p[role=alert]").textContent() : null;
const warnings = await page.locator("ul[aria-label='Avertissements de lecture'] li").allTextContents();
await cdp.send("Page.stopScreencast").catch(() => undefined);
await context.close();
await browser.close();

// Optional: every frame as an image named by its time in the video (FRAMES_DIR=<dossier>).
if (process.env.FRAMES_DIR) {
  mkdirSync(process.env.FRAMES_DIR, { recursive: true });
  for (const frame of frames) {
    writeFileSync(join(process.env.FRAMES_DIR, `${String(frame.at - started).padStart(7, "0")}.jpg`), frame.image);
  }
}

// Chrome only sends a frame when the page changes: each one is held until the next, at a steady rate.
const file = join(out, `${name}.webm`);
const cache = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), "AppData/Local/ms-playwright"));
const ffmpeg = process.env.FFMPEG_PATH ?? (existsSync(cache) ? readdirSync(cache).filter((entry) => entry.startsWith("ffmpeg-")).sort()
  .map((entry) => join(cache, entry, "ffmpeg-win64.exe")).filter(existsSync).at(-1) : undefined);
if (ffmpeg && frames.length) {
  const rate = 25;
  const encoder = spawn(ffmpeg, ["-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-r", String(rate), "-i", "pipe:0", "-y", "-an",
    "-c:v", "vp8", "-qmin", "0", "-qmax", "40", "-crf", "8", "-b:v", "2M", "-r", String(rate), file], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolveDone) => encoder.on("close", resolveDone));
  let index = 0;
  for (let time = frames[0].at; time <= frames.at(-1).at; time += 1000 / rate) {
    while (index + 1 < frames.length && frames[index + 1].at <= time) index++;
    if (!encoder.stdin.write(frames[index].image)) await new Promise((drained) => encoder.stdin.once("drain", drained));
  }
  encoder.stdin.end();
  await done;
} else {
  console.error("Encodeur ffmpeg introuvable : vidéo non assemblée (définir FFMPEG_PATH, ou FRAMES_DIR pour garder les images).");
}
writeFileSync(join(out, `${name}.passages.json`), JSON.stringify({
  lesson, status, alert, warnings, errors, frames: frames.length, videoStartsAt: frames.length ? (frames[0].at - started) / 1000 : null, passages,
}, null, 2));
console.log(JSON.stringify({ video: file, status, alert, warnings, errors: errors.length, passages: passages.length }, null, 2));
