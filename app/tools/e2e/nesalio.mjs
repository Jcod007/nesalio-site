#!/usr/bin/env node
/**
 * Test de bout en bout de la page élève Nesalio, dans un vrai navigateur, sur
 * ordinateur et sur téléphone (390 px). Aucun appel au modèle ni à la voix :
 * /api/nesalio répond avec une leçon enregistrée (fixtures/lecon-equation.ndjson,
 * flux lesson / slice / end produit par fixture-nesalio.mjs) et /api/voice en 503,
 * donc Nesa joue la leçon en sous-titres, comme quand la voix manque.
 *
 *   NESALIO_URL=http://localhost:3000/ npm run test:e2e:nesalio
 *
 * La page « / » doit servir NesalioApp sans compte : voir « Accès en test » plus bas.
 * Première fois : npx playwright install chromium (ou CHROME_PATH=/chemin/vers/chrome).
 *
 * Vérifie, à chaque taille d'écran :
 *   1. l'accueil s'affiche, sans violation d'accessibilité grave (axe) ;
 *   2. la question posée part à /api/nesalio (pas à l'ancien tuteur) et s'affiche ;
 *   3. le sous-titre suit la leçon ; le tableau est dessiné ;
 *   4. pause : le sous-titre ne bouge plus ; reprise : la leçon repart ;
 *   5. le bouton du son bascule ;
 *   6. arrêt « Prends le temps de lire le tableau » en fin de tranche ; « Phrase précédente » ramène la phrase
 *      d'avant sans rappeler /api/nesalio ; « Continuer » à chaque arrêt jusqu'à la fin : « Voilà pour l'explication »,
 *      sans violation axe grave en séance ;
 *   7. « Revoir l'explication » rejoue la leçon sans nouvel appel à /api/nesalio ;
 *   8. une erreur du serveur affiche un message et « Réessayer ».
 *
 * Accès en test : la démo locale sans compte ni IA (NESALIO_LOCAL_DEMO=1 DISABLE_AI=1 npm run dev,
 * comme la vérification GitHub) sert NesalioApp ; sans elle, « / » demande un compte ou l'essai.
 * Le script détecte une page qui ne sert pas NesalioApp et l'explique.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const URL_UNDER_TEST = process.env.NESALIO_URL ?? "http://localhost:3000/";
const FIXTURE = readFileSync(new URL("./fixtures/lecon-equation.ndjson", import.meta.url), "utf8");
const EVENTS = FIXTURE.trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const QUESTION = "Comment je résous 3x + 5 = 17 ?";
const SAID = EVENTS.filter((e) => e.kind === "slice").flatMap((e) => e.slice.beats.map((b) => b.say));
const FIRST = SAID[0];
const SCREENS = [
  { name: "ordinateur", width: 1366, height: 800 },
  { name: "téléphone", width: 390, height: 844 },
];
/** Expected without voice nor account: /api/voice answers 503, side calls may answer 401. */
const EXPECTED = [/\/api\/voice/, /status of (401|403|503)/, /GPU stall/, /Audio indisponible/];
const NO_ACCESS =
  "La page « / » ne sert pas NesalioApp sans compte. Il faut un accès de test côté app (voir le compte rendu du lot 6) : " +
  "par exemple NESALIO_LOCAL_DEMO=1 qui sert NesalioApp hors production, /api/nesalio et /api/voice étant simulés par ce test.";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const failures = [];
const fail = (screen, message) => failures.push(`[${screen}] ${message}`);

async function seriousViolations(page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}
const describe = (v) =>
  `${v.id} (${v.help}) ${v.nodes
    .slice(0, 3)
    .map((n) => n.target.join(" "))
    .join(" ; ")}`;

for (const screen of SCREENS) {
  const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height } });
  const page = await context.newPage();
  const errors = [];
  const calls = { nesalio: 0, voice: 0, tutor: 0 };
  let serverMode = "lesson";
  let step = "0. chargement";
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/voice", (route) => {
    calls.voice++;
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Voix désactivée pour le test." }) });
  });
  await page.route("**/api/tutor", (route) => {
    calls.tutor++;
    return route.fulfill({ status: 503, body: "" });
  });
  await page.route("**/api/nesalio", async (route) => {
    calls.nesalio++;
    const body = route.request().postDataJSON();
    if (body?.question !== QUESTION) fail(screen.name, `question envoyée inattendue : ${JSON.stringify(body)}`);
    const payload =
      serverMode === "error"
        ? JSON.stringify({ kind: "error", code: "upstream", message: "Nesa n'arrive pas à répondre pour le moment. Réessaie dans un instant." }) + "\n"
        : FIXTURE;
    await route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body: payload });
  });

  const dock = page.getByRole("region", { name: "Nesa" });
  const caption = () =>
    dock
      .locator("[aria-live=polite]")
      .innerText()
      .catch(() => "");
  const ask = async () => {
    const field = page.locator("form[data-size=large] input");
    await field.fill(QUESTION);
    await field.press("Enter");
  };

  try {
    // 1. Accueil
    step = "1. Accueil";
    await page.goto(URL_UNDER_TEST, { waitUntil: "load", timeout: 120_000 });
    if (/connexion|inscription/.test(page.url())) throw new Error(`${NO_ACCESS} (redirigé vers ${page.url()})`);
    await page.getByRole("heading", { name: /quelle notion tu bloques/i }).waitFor({ timeout: 15_000 });
    for (const v of await seriousViolations(page)) fail(screen.name, `accueil, accessibilité : ${describe(v)}`);

    // 2. Question
    step = "2. Question";
    await ask();
    await page.waitForTimeout(500);
    if (calls.tutor > 0 && calls.nesalio === 0) throw new Error(`${NO_ACCESS} (la question est partie à /api/tutor : ancien tuteur)`);
    await dock.getByText(QUESTION).waitFor({ timeout: 10_000 });
    if (calls.nesalio !== 1) fail(screen.name, `/api/nesalio appelé ${calls.nesalio} fois pour une question`);

    // 3. Sous-titre et tableau
    step = "3. Sous-titre et tableau";
    await dock.getByText(FIRST).waitFor({ timeout: 30_000 });
    const title = await page.getByText(EVENTS[0].lesson.title).count();
    if (!title) fail(screen.name, "titre de la leçon absent de la barre du haut");
    if (!(await page.locator("canvas").count())) fail(screen.name, "aucun tableau (canvas) pendant la séance");
    if (calls.voice === 0) fail(screen.name, "aucune demande de voix : le lecteur n'a pas essayé /api/voice");

    // 4. Pause puis reprise
    step = "4. Pause puis reprise";
    await dock.getByRole("button", { name: /^Pause$/ }).click();
    await dock.getByText("En pause.").waitFor({ timeout: 5_000 });
    const pausedOn = await caption();
    await page.waitForTimeout(8_000); // longer than any passage of the fixture shown as a caption (≤ 6 s)
    if ((await caption()) !== pausedOn) fail(screen.name, "le sous-titre a changé pendant la pause");
    await dock.getByRole("button", { name: /Reprendre/ }).click();
    await dock.getByText("En pause.").waitFor({ state: "detached", timeout: 5_000 });

    // 5. Son
    step = "5. Son";
    const mute = page.getByRole("button", { name: /Couper la voix de Nesa/ });
    await mute.click();
    await page.getByRole("button", { name: /Réactiver la voix de Nesa/ }).waitFor({ timeout: 5_000 });
    if ((await page.getByRole("button", { name: /Réactiver la voix de Nesa/ }).getAttribute("aria-pressed")) !== "true")
      fail(screen.name, "bouton du son : aria-pressed n'est pas à true");
    await page.getByRole("button", { name: /Réactiver la voix de Nesa/ }).click();
    for (const v of await seriousViolations(page)) fail(screen.name, `séance, accessibilité : ${describe(v)}`);

    // 6. Arrêt en fin de tranche, retour d'une phrase, puis fin
    step = "6. Arrêt en fin de tranche";
    const resting = dock.getByText("Prends le temps de lire le tableau.");
    const end = dock.getByText(/Voilà pour l'explication/);
    await resting.or(end).first().waitFor({ timeout: 90_000 });
    if (!(await resting.count())) fail(screen.name, "aucun arrêt « Continuer » en fin de tranche");
    else {
      const restingOn = (await caption()).split("\n")[0];
      const at = SAID.indexOf(restingOn);
      if (at < 1) fail(screen.name, `arrêt sur une phrase inattendue : ${JSON.stringify(restingOn.slice(0, 80))}`);
      else {
        step = "6. Phrase précédente";
        await dock.getByRole("button", { name: /Phrase précédente/ }).click();
        await dock.getByText(SAID[at - 1]).waitFor({ timeout: 10_000 });
        if (calls.nesalio !== 1) fail(screen.name, "revenir d'une phrase a rappelé /api/nesalio");
      }
    }
    step = "6. Fin";
    let stops = 0;
    while (!(await end.count())) {
      await resting.or(end).first().waitFor({ timeout: 90_000 });
      if (await resting.count()) {
        stops++;
        await dock.getByRole("button", { name: "Continuer" }).click();
        await resting.waitFor({ state: "detached", timeout: 5_000 });
      }
      if (stops > SAID.length) throw new Error("trop d'arrêts « Continuer »");
    }
    for (const v of await seriousViolations(page)) fail(screen.name, `fin de séance, accessibilité : ${describe(v)}`);
    // The after-trial questions open one minute after the lesson ends (AFTER_TRIAL_DELAY in NesalioApp.tsx: « Revoir
    // l'explication » stays reachable first), over the dock: closed here.
    const survey = page.getByRole("dialog");
    await survey.waitFor({ timeout: 75_000 });
    for (const v of await seriousViolations(page)) fail(screen.name, `questionnaire après essai, accessibilité : ${describe(v)}`);
    await survey.getByRole("button", { name: "Fermer" }).click();
    await survey.waitFor({ state: "hidden", timeout: 5_000 });

    // 7. Revoir sans nouvel appel au modèle
    step = "7. Revoir sans nouvel appel au modèle";
    const before = calls.nesalio;
    await dock.getByRole("button", { name: /Revoir l'explication/ }).click();
    await dock.getByText(FIRST).waitFor({ timeout: 30_000 });
    if (calls.nesalio !== before) fail(screen.name, "« Revoir l'explication » a rappelé /api/nesalio");

    // 8. Erreur simulée
    step = "8. Erreur simulée";
    serverMode = "error";
    await page
      .getByRole("button", { name: /Nouvelle question|Nouvelle notion/ })
      .first()
      .click();
    await page.getByRole("heading", { name: /quelle notion tu bloques/i }).waitFor({ timeout: 10_000 });
    await ask();
    await dock.getByText(/Nesa n'arrive pas à répondre/).waitFor({ timeout: 15_000 });
    await dock.getByRole("button", { name: "Réessayer" }).waitFor({ timeout: 5_000 });
  } catch (error) {
    fail(
      screen.name,
      `parcours interrompu à l'étape « ${step} » : ${error.message.split("\n")[0]} (carte de Nesa : ${JSON.stringify((await caption()).slice(0, 120))})`,
    );
    if (process.env.E2E_CAPTURES) await page.screenshot({ path: `${process.env.E2E_CAPTURES}/nesalio-${screen.name}.png` }).catch(() => {});
  }

  for (const e of new Set(errors)) if (!EXPECTED.some((re) => re.test(e))) fail(screen.name, `erreur console : ${e.slice(0, 200)}`);
  await context.close();
}
await browser.close();

if (failures.length) {
  console.error(`Échec (${failures.length}) :\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Parcours Nesalio OK sur ${SCREENS.map((s) => s.name).join(" et ")} (${URL_UNDER_TEST}).`);
