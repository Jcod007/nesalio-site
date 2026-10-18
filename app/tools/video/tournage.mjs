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

const browser = await chromium.launch({ channel: "chromium", args: ["--autoplay-policy=no-user-gesture-required", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: SIZE }, locale: "fr-CA" });

// L'audio de chaque phrase, envoyé depuis la page (le navigateur le reçoit de /api/voice).
const audio = new Map();
await context.exposeFunction("__saveVoice", (text, b64) => {
  if (!audio.has(text)) audio.set(text, Buffer.from(b64, "base64"));
});
// Le contenu de chaque tour (flux NDJSON de /api/tutor), lu dans la page une fois le tour fini.
const turns = [];
await context.exposeFunction("__saveTurn", (body) => {
  turns.push(body.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)));
});

// Dans la page : associer chaque URL audio à la phrase dite, et noter quand la voix démarre / s'arrête.
// Les éléments audio de Nesa ne sont pas dans le DOM : on écoute chaque élément au moment où il joue.
await context.addInitScript(() => {
  const textOfBlob = new WeakMap();
  const textOfUrl = new Map();
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await origFetch(input, init);
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/api/tutor") && res.ok) res.clone().text().then((body) => window.__saveTurn?.(body));
    if (url.includes("/api/voice") && res.ok) {
      const text = JSON.parse(init?.body ?? "{}").text;
      res.clone().arrayBuffer().then((buf) => {
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        window.__saveVoice?.(text, btoa(bin));
      });
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
  const watched = new WeakSet();
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (!watched.has(this)) {
      watched.add(this);
      for (const kind of ["playing", "pause", "ended"]) {
        this.addEventListener(kind, () => {
          if (textOfUrl.has(this.src)) window.__voix.push({ kind, at: Date.now(), text: textOfUrl.get(this.src), pos: this.currentTime });
        });
      }
    }
    return origPlay.apply(this, args);
  };
});

const pageCreated = Date.now();
const page = await context.newPage();
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
for (const [t, events] of turns.entries()) {
  console.log(`--- tour ${t + 1}`);
  for (const e of events) {
    if (e.kind === "step") console.log(`  « ${e.say} » [${e.do.map((a) => a.type + (a.label ? ":" + a.label : a.text ? ":" + a.text : "")).join(", ")}]${e.check ? `\n  ? ${e.check.prompt} ${JSON.stringify(e.check.choices)} bon=${e.check.answer}` : ""}`);
    if (e.kind === "end") console.log("  FIN", JSON.stringify(e.summary));
  }
}
const played = voix.filter((v) => v.kind === "playing").length;
console.log(`voix jouées : ${played}, durée : ${Math.round((Date.now() - pageCreated) / 1000)} s`);
console.log(`fini : ${turns.length} tours, ${clips.length} phrases, ${voix.length} événements de voix`);
