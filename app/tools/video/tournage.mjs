// Tournage d'une vraie séance Nesalio : l'app en ligne, le vrai modèle, la vraie voix.
// Sortie (dans OUT) : video.webm (image), voix-NN.wav + voix.json (son et instants), tours.json (contenu).
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const URL = process.env.NESALIO_URL ?? "https://nesalio-app.vercel.app/";
const OUT = process.env.OUT ?? "/vercel/tournage";
const QUESTION = process.env.QUESTION ?? "Pourquoi sin² x + cos² x = 1 ?";
const MAX_TURNS = Number(process.env.MAX_TURNS ?? 3);
const SIZE = { width: 1080, height: 1080 };
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: SIZE }, locale: "fr-CA" });

// Dans la page : associer chaque URL audio à la phrase dite, et noter quand la voix démarre / s'arrête.
await context.addInitScript(() => {
  const textOfBlob = new WeakMap();
  const textOfUrl = new Map();
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await origFetch(input, init);
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/api/voice") && res.ok) {
      const text = JSON.parse(init?.body ?? "{}").text;
      const origBlob = res.blob.bind(res);
      res.blob = async () => {
        const b = await origBlob();
        textOfBlob.set(b, text);
        return b;
      };
    }
    return res;
  };
  const origCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    const u = origCreate(obj);
    if (textOfBlob.has(obj)) textOfUrl.set(u, textOfBlob.get(obj));
    return u;
  };
  window.__voix = [];
  for (const kind of ["playing", "pause", "ended"]) {
    document.addEventListener(kind, (e) => {
      const el = e.target;
      if (el instanceof HTMLMediaElement && textOfUrl.has(el.src)) window.__voix.push({ kind, at: Date.now(), text: textOfUrl.get(el.src), pos: el.currentTime });
    }, true);
  }
});

// Côté Node : garder l'audio de chaque phrase et le contenu de chaque tour.
const audio = new Map();
const turns = [];
const pageCreated = Date.now();
const page = await context.newPage();
page.on("response", async (res) => {
  const u = res.url();
  try {
    if (u.includes("/api/voice") && res.ok()) {
      const text = JSON.parse(res.request().postData() ?? "{}").text;
      audio.set(text, await res.body());
    } else if (u.includes("/api/tutor")) {
      const body = await res.text();
      turns.push(body.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)));
    }
  } catch (e) {
    console.log("réponse non lue", u, e.message);
  }
});
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 200)));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const input = page.locator("form[data-size=large] input");
await input.click();
await input.pressSequentially(QUESTION, { delay: 70 });
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Demander à Nesa" }).click();

/** La dernière question posée par Nesa et son bon choix (lus dans le flux du tour). */
function lastCheck() {
  for (let t = turns.length - 1; t >= 0; t--) {
    for (let i = turns[t].length - 1; i >= 0; i--) if (turns[t][i].check) return turns[t][i].check;
  }
  return null;
}

let answered = 0;
const started = Date.now();
while (Date.now() - started < 6 * 60_000) {
  const choices = page.locator("[role=group] button");
  if ((await choices.count()) > 0 && turns.length > answered) {
    await page.waitForTimeout(1800); // l'élève lit la question
    const check = lastCheck();
    const count = await choices.count();
    // Premier choix : une erreur typique (pour voir Nesa la repérer) ; ensuite, la bonne réponse.
    let pick = 0;
    if (check && typeof check.answer === "number") pick = answered === 0 ? (check.answer + 1) % count : check.answer;
    console.log(`tour ${turns.length} : choix ${pick} « ${await choices.nth(pick).innerText()} » (bon : ${check?.answer})`);
    await choices.nth(pick).click();
    answered++;
    if (answered >= MAX_TURNS) {
      await page.waitForTimeout(9000); // la réaction de Nesa
      break;
    }
  }
  if (await page.getByText("Séance terminée").count()) {
    await page.waitForTimeout(4000);
    break;
  }
  await page.waitForTimeout(400);
}

const voix = await page.evaluate(() => window.__voix);
await page.screenshot({ path: `${OUT}/fin.png` });
await context.close();
await browser.close();

const clips = [];
let n = 0;
for (const [text, bytes] of audio) {
  const file = `voix-${String(++n).padStart(2, "0")}.wav`;
  writeFileSync(`${OUT}/${file}`, bytes);
  clips.push({ file, text });
}
writeFileSync(`${OUT}/voix.json`, JSON.stringify({ pageCreated, clips, events: voix }, null, 1));
writeFileSync(`${OUT}/tours.json`, JSON.stringify(turns, null, 1));
console.log(`fini : ${turns.length} tours, ${clips.length} phrases, ${voix.length} événements de voix`);
