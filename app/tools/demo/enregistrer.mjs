#!/usr/bin/env node
/**
 * Enregistre une vraie séance sur l'outil en ligne (vrai modèle, vraie voix de
 * Nesa), jouée comme un élève : il tape sa question, interrompt Nesa, se trompe
 * une fois, puis réussit. Sert à faire des vidéos de démonstration.
 *
 *   SCENARIO=vecteurs NESALIO_URL=https://app.nesalio.com/ OUT=sortie node tools/demo/enregistrer.mjs
 *
 * Produit dans OUT : brut.webm (image), clips/NN.wav (voix de Nesa), chronologie.json
 * (heure de chaque phrase dans la vidéo, attentes, réponses), puis demo.mp4 (image + voix).
 * Playwright n'enregistre pas le son : la voix est captée dans la page et recollée avec ffmpeg.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.NESALIO_URL ?? "https://app.nesalio.com/";
const OUT = process.env.OUT ?? "sortie";
const SIZE = { width: 1080, height: 1080 };
const SCENARIOS = {
  vecteurs: {
    question: "J'ai pas compris en classe comment on additionne deux vecteurs",
    interruption: "Attends, pourquoi on met la flèche au bout de l'autre ?",
  },
  parabole: {
    question: "Pourquoi la parabole de f(x) = -(x-2)² + 3 coupe l'axe des x deux fois ?",
    interruption: "Attends, c'est quoi le sommet exactement ?",
  },
  projectile: {
    question: "Je comprends pas pourquoi une balle lancée fait une courbe",
    interruption: "Attends, pourquoi la vitesse horizontale change pas ?",
  },
};
const scenario = SCENARIOS[process.env.SCENARIO ?? "vecteurs"];
if (!scenario) throw new Error(`Scénario inconnu : ${process.env.SCENARIO}`);
/** Durée maximale de la séance (le modèle peut prendre plusieurs secondes par tour). */
const MAX_MS = Number(process.env.MAX_MS ?? 6 * 60_000);

mkdirSync(join(OUT, "clips"), { recursive: true });

/** Dans la page : curseur visible, et capture des clips audio joués (Playwright n'enregistre pas le son). */
const INIT = () => {
  const blobs = new Map();
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => {
    const url = create(b);
    if (b instanceof Blob && b.type.startsWith("audio")) blobs.set(url, b);
    return url;
  };
  window.__clips = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (blobs.has(this.src)) {
      const clip = { src: this.src, start: performance.now(), end: null };
      window.__clips.push(clip);
      const stop = () => (clip.end ??= performance.now());
      this.addEventListener("pause", stop, { once: true });
      this.addEventListener("ended", stop, { once: true });
    }
    return play.call(this);
  };
  window.__dumpClips = async () =>
    Promise.all(
      window.__clips.map(async (c) => {
        const blob = blobs.get(c.src);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { start: c.start, end: c.end, type: blob.type, base64: btoa(bin) };
      }),
    );
  // Curseur et clic visibles dans la vidéo.
  addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;z-index:99999;left:0;top:0;width:22px;height:22px;margin:-4px 0 0 -4px;pointer-events:none;" +
      "transition:transform .05s linear;background:no-repeat url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4 2l15 10-7 1.5L8.5 21z' fill='%2318223a' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E\");";
    document.body.appendChild(dot);
    addEventListener("mousemove", (e) => (dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`), true);
    addEventListener(
      "mousedown",
      (e) => {
        const ring = document.createElement("div");
        ring.style.cssText = `position:fixed;z-index:99998;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;border:3px solid #5A45D6;pointer-events:none;transition:all .45s ease-out;opacity:1`;
        document.body.appendChild(ring);
        requestAnimationFrame(() => {
          ring.style.transform = "scale(1.8)";
          ring.style.opacity = "0";
        });
        setTimeout(() => ring.remove(), 500);
      },
      true,
    );
  });
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"] });
const context = await browser.newContext({
  viewport: SIZE,
  recordVideo: { dir: OUT, size: SIZE },
  locale: "fr-CA",
});
await context.addInitScript(INIT);
const page = await context.newPage();
const videoStartEpoch = Date.now();

/** Bonnes réponses, lues dans le flux du serveur (pour se tromper exprès une seule fois). */
const answers = [];
page.on("response", async (response) => {
  if (!response.url().includes("/api/tutor")) return;
  try {
    for (const line of (await response.text()).split("\n")) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.kind === "step" && event.check) answers.push({ prompt: event.check.prompt, answer: event.check.answer });
    }
  } catch {}
});

const timeline = [];
const mark = (what, extra = {}) => timeline.push({ at: Date.now() - videoStartEpoch, what, ...extra });

async function moveTo(locator) {
  const box = await locator.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
  await page.waitForTimeout(250);
}
async function humanClick(locator) {
  await moveTo(locator);
  await locator.click();
}
async function humanType(locator, text) {
  await humanClick(locator);
  await locator.pressSequentially(text, { delay: 55 });
  await page.waitForTimeout(400);
}

// En cas d'échec : capture d'écran et message dans OUT, pour comprendre sans les journaux.
process.on("unhandledRejection", async (error) => {
  writeFileSync(join(OUT, "erreur.txt"), String(error?.stack ?? error));
  await page.screenshot({ path: join(OUT, "erreur.png") }).catch(() => {});
  process.exit(1);
});

await page.goto(URL, { waitUntil: "networkidle" });
writeFileSync(join(OUT, "page.txt"), `${page.url()}\n${await page.title()}\n${(await page.locator("body").innerText()).slice(0, 2000)}`);
const timeOrigin = await page.evaluate(() => performance.timeOrigin);
await page.mouse.move(SIZE.width / 2, SIZE.height - 120);
await page.waitForTimeout(1500);

mark("question", { text: scenario.question });
const input = page.locator("form[data-size=large] input");
await humanType(input, scenario.question);
await humanClick(page.getByRole("button", { name: "Demander à Nesa" }));

const started = Date.now();
let interrupted = false;
let checks = 0;
let captions = 0;
let lastCaption = "";

while (Date.now() - started < MAX_MS) {
  await page.waitForTimeout(300);
  const caption = (await page.locator("section[aria-label=Nesa] [class*=caption]").first().innerText().catch(() => "")).trim();
  if (caption && caption !== lastCaption) {
    lastCaption = caption;
    captions++;
    mark("phrase", { text: caption });
  }

  // Une seule interruption, pendant la deuxième phrase du premier tour : l'élève demande une précision.
  const stop = page.getByRole("button", { name: /Attends, je comprends pas/ });
  if (!interrupted && captions >= 2 && (await stop.isVisible().catch(() => false))) {
    interrupted = true;
    await page.waitForTimeout(1200);
    mark("interruption");
    await humanClick(stop);
    const ask = page.getByPlaceholder("Dis-moi ce qui bloque…");
    await ask.waitFor({ timeout: 10_000 });
    await humanType(ask, scenario.interruption);
    await humanClick(page.getByRole("button", { name: "Demander", exact: true }));
    mark("question-interruption", { text: scenario.interruption });
    continue;
  }

  // Après la réponse à l'interruption, Nesa peut proposer de reprendre.
  const resume = page.getByRole("button", { name: /Continuer l'explication/ });
  if (await resume.isVisible().catch(() => false)) {
    await page.waitForTimeout(1200);
    await humanClick(resume);
    mark("reprise");
    continue;
  }

  // Question de Nesa : la première fois, l'élève se trompe ; ensuite, il répond juste.
  const group = page.locator("section[aria-label=Nesa] [role=group]");
  const buttons = group.locator("button");
  if ((await buttons.count()) > 0 && (await buttons.first().isEnabled().catch(() => false))) {
    const prompt = (await group.getAttribute("aria-label")) ?? "";
    const known = answers.find((a) => a.prompt === prompt);
    await page.waitForTimeout(2200); // le temps de lire la question
    const n = await buttons.count();
    let pick = 0;
    if (known && typeof known.answer === "number") pick = checks === 0 ? (known.answer + 1) % n : known.answer;
    checks++;
    mark("reponse", { prompt, pick, juste: known ? pick === known.answer : null });
    await humanClick(buttons.nth(pick));
    await page.waitForTimeout(800);
    continue;
  }

  if (await page.getByRole("heading", { name: "Séance terminée" }).isVisible().catch(() => false)) {
    mark("fin");
    await page.waitForTimeout(6000);
    break;
  }
}

// Carte de fin.
await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#f6f7fb;font-family:system-ui,sans-serif;color:#18223a">
  <div style="text-align:center"><div style="font-size:84px;font-weight:800;letter-spacing:-2px">Nesalio</div>
  <div style="font-size:34px;margin-top:18px;color:#5A45D6;font-weight:700">app.nesalio.com</div></div></body>`);
mark("carte-fin");
await page.waitForTimeout(3500);

const clips = await page.evaluate(() => window.__dumpClips()).catch(() => []);
const video = page.video();
await context.close();
let hasVideo = true;
try {
  await video.saveAs(join(OUT, "brut.webm"));
} catch (error) {
  hasVideo = false; // encodeur vidéo de Playwright absent (npx playwright install ffmpeg)
  console.warn("Pas de vidéo :", error.message.split("\n")[0]);
}
await browser.close();

// Voix : chaque clip à son heure dans la vidéo, coupé là où Nesa a été interrompue.
const offset = timeOrigin - videoStartEpoch;
const placed = [];
clips.forEach((clip, i) => {
  if (!clip) return;
  const file = join(OUT, "clips", `${String(i).padStart(2, "0")}.wav`);
  writeFileSync(file, Buffer.from(clip.base64, "base64"));
  placed.push({ file, atMs: Math.max(0, Math.round(offset + clip.start)), durMs: clip.end ? Math.round(clip.end - clip.start) : null });
});
writeFileSync(join(OUT, "chronologie.json"), JSON.stringify({ scenario, url: URL, timeline, clips: placed, answers }, null, 2));
if (!hasVideo) process.exit(2);

const args = ["-y", "-i", join(OUT, "brut.webm")];
placed.forEach((c) => args.push("-i", c.file));
const filters = placed.map((c, i) => `[${i + 1}:a]${c.durMs ? `atrim=0:${(c.durMs / 1000).toFixed(3)},` : ""}adelay=${c.atMs}|${c.atMs}[a${i}]`);
const mix = placed.length ? `${filters.join(";")};${placed.map((_, i) => `[a${i}]`).join("")}amix=inputs=${placed.length}:normalize=0[voix]` : null;
args.push(...(mix ? ["-filter_complex", mix, "-map", "0:v", "-map", "[voix]"] : ["-map", "0:v"]));
args.push("-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", join(OUT, "demo.mp4"));
execFileSync("ffmpeg", args, { stdio: "inherit" });
console.log(`Vidéo : ${join(OUT, "demo.mp4")} — ${placed.length} phrases, ${checks} réponses, interruption : ${interrupted}`);
console.log(readdirSync(OUT).join(" "));
