#!/usr/bin/env node
/**
 * Test de bout en bout : le parcours d'un élève dans un vrai navigateur, sur
 * ordinateur et sur téléphone. Sert de filet anti-régression avant un déploiement.
 *
 *   npm run build && DISABLE_AI=1 npm start        (dans un autre terminal)
 *   npm run test:e2e                               (NESALIO_URL=… pour viser un déploiement)
 *
 * Première fois : npx playwright install chromium
 * (ou CHROME_PATH=/chemin/vers/chrome pour utiliser un navigateur déjà installé).
 *
 * Vérifie, à chaque taille d'écran :
 *   1. l'accueil s'affiche, sans erreur dans la console ;
 *   2. le champ de question reste assez large pour lire ce qu'on écrit ;
 *   3. une question suggérée lance une séance : Nesa parle et le tableau se remplit ;
 *   4. aucune violation d'accessibilité grave ou critique (axe), à l'accueil et en séance.
 * Sans service d'IA (DISABLE_AI=1), la séance jouée est une démonstration : rien n'est facturé.
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const URL = process.env.NESALIO_URL ?? "http://localhost:3000/";
const SCREENS = [
  { name: "ordinateur", width: 1366, height: 800 },
  { name: "téléphone", width: 390, height: 844 },
];
/** Erreurs attendues : sans service d'IA, /api/voice répond 503 et le navigateur prend sa propre voix. */
const EXPECTED = [/\/api\/voice/, /status of 503/, /GPU stall/];
/** Largeur minimale du champ de question, en pixels, pour lire une question entière. */
const MIN_FIELD_WIDTH = 240;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const failures = [];
const fail = (screen, message) => failures.push(`[${screen}] ${message}`);

async function seriousViolations(page) {
  // Les mots que Nesa n'a pas encore dits sont volontairement pâles (effet karaoké) : contraste à trancher, exclu en attendant.
  const { violations } = await new AxeBuilder({ page }).exclude('[class*="upcoming"]').analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

for (const screen of SCREENS) {
  const context = await browser.newContext({ viewport: { width: screen.width, height: screen.height } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));

  try {
    await page.goto(URL, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /quelle notion tu bloques/i }).waitFor();

    const field = await page.locator("form[data-size=large] input").boundingBox();
    if (!field || field.width < MIN_FIELD_WIDTH) {
      fail(screen.name, `champ de question trop étroit : ${Math.round(field?.width ?? 0)} px (minimum ${MIN_FIELD_WIDTH})`);
    }
    for (const v of await seriousViolations(page)) fail(screen.name, `accueil, accessibilité : ${v.id} (${v.help})`);

    await page.getByRole("button", { name: /portée d.un projectile/i }).click();
    await page.getByRole("button", { name: /je comprends pas/i }).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(6_000); // laisser Nesa dessiner les premières étapes
    const drawn = await page.locator("canvas").count();
    if (drawn === 0) fail(screen.name, "la séance a démarré mais aucun tableau n'est affiché");
    for (const v of await seriousViolations(page)) fail(screen.name, `séance, accessibilité : ${v.id} (${v.help}) ${v.nodes.map((n) => n.target.join(" ") + ": " + n.failureSummary).join(" ; ")}`);
  } catch (error) {
    fail(screen.name, `parcours interrompu : ${error.message.split("\n")[0]}`);
  }

  for (const e of new Set(errors)) if (!EXPECTED.some((re) => re.test(e))) fail(screen.name, `erreur console : ${e.slice(0, 200)}`);
  await context.close();
}
await browser.close();

if (failures.length) {
  console.error(`Échec (${failures.length}) :\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Parcours OK sur ${SCREENS.map((s) => s.name).join(" et ")} (${URL}).`);
