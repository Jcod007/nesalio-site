/** Vrai navigateur → API → parcours calculé → réponse → aide, sans modèle ni voix payante. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--no-sandbox"] });
try {
  for (const viewport of [{ width: 1366, height: 800 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const requests = [], responses = [], errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (r) => { if (r.url().endsWith("/api/tutor")) requests.push(r.postDataJSON()); });
    await page.route("**/api/tutor", async (route) => {
      // Le corps vient du vrai serveur ; on le conserve avant d'accélérer l'horloge d'affichage.
      const response = await route.fetch();
      const body = await response.text();
      responses.push(body);
      await route.fulfill({ response, body });
    });
    await page.route("**/api/voice", (route) => route.fulfill({ status: 503, body: "" }));
    await page.clock.install();
    await page.goto(process.env.NESALIO_URL ?? "http://localhost:3103", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Couper la voix de Nesa", exact: true }).click();
    await page.locator("form[data-size=large] input").fill("Explique-moi le théorème de Thalès depuis zéro.");
    await page.locator("form[data-size=large] input").press("Enter");
    const done = page.getByRole("button", { name: "Essayer un exercice guidé", exact: true });
    const help = page.getByRole("button", { name: "Montre-moi d'abord", exact: true });
    async function finishUntil(locator) {
      for (let i = 0; i < 60; i++) {
        if (await locator.isVisible()) return;
        await page.clock.fastForward(20_000);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      throw Error("Le parcours n'atteint pas l'état attendu : " + locator);
    }
    await finishUntil(done);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await page.clock.runFor(800); // laisser le cadrage suivre la taille du bilan
    assert.equal(await page.getByRole("group").count(), 0, "aucun quiz initial");
    if (process.env.NESALIO_SCREENSHOT_DIR) {
      await mkdir(process.env.NESALIO_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.NESALIO_SCREENSHOT_DIR, `thales-${viewport.width}.png`) });
    }
    await done.click();
    await finishUntil(help);
    assert.equal(requests[1]?.context?.program?.id, "thales-v1");
    await help.click();
    await finishUntil(done);
    assert.equal(requests[2]?.context?.program?.exercise, 1);
    assert.equal(requests[2]?.answer?.correct, null);
    await page.getByPlaceholder("Une autre question sur cette notion ?").fill("Je ne comprends toujours pas.");
    await page.getByPlaceholder("Une autre question sur cette notion ?").press("Enter");
    await finishUntil(done);
    const transcripts = responses;
    assert.equal(transcripts.length, 4);
    assert(transcripts.every((text) => text.includes('"source":"curriculum"')));
    assert(!transcripts[2].includes('"check":'), "la demande d'aide reçoit une explication sans nouveau test");
    assert(transcripts[3].includes("coefficient d'agrandissement 4"), "la difficulté répétée déclenche une autre représentation");
    assert.equal(requests[3]?.context?.program?.exercise, 1, "les mesures restent celles du même exercice");
    assert.deepEqual(errors, []);
    await context.close();
    process.stdout.write(`Thalès vérifié de bout en bout (${viewport.width} × ${viewport.height}).\n`);
  }
} finally { await browser.close(); }
