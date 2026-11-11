/** NESALIO_URL=http://localhost:3000/dev node tools/e2e/photo.mjs. Aucun appel externe. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";

const url = process.env.NESALIO_URL || "http://localhost:3000/dev";
const fixture = readFileSync(new URL("./fixtures/lecon-equation.ndjson", import.meta.url), "utf8");
const original = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "white" } })
  .png()
  .toBuffer();
const recognized = "Résous 3x − 5 = 10. " + "Une donnée avec son unité. ".repeat(30);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
mkdirSync("../analyses/captures/photos", { recursive: true });
let activePage;
// After hydration the field shows either the microphone or, without voice support, a hint.
const mounted = (page) =>
  page.getByRole("button", { name: "Parler à Nesa", exact: true }).or(page.getByText("Écris ta question pour essayer.")).first().waitFor();
try {
  for (const width of [1366, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(30_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let photoFails = false;
    let submitted = "";
    let imageCalls = 0;
    await page.route("**/api/photo", async (route) => {
      imageCalls++;
      const { image } = route.request().postDataJSON();
      const bytes = Buffer.from(image, "base64");
      const metadata = await sharp(bytes).metadata();
      assert.equal(metadata.format, "jpeg");
      assert.ok(Math.max(metadata.width, metadata.height) <= 1600);
      assert.ok(bytes.length <= 1_500_000);
      assert.equal(metadata.exif, undefined);
      await route.fulfill({
        status: photoFails ? 422 : 200,
        contentType: "application/json",
        body: JSON.stringify(photoFails ? { error: "Reprends une photo plus nette." } : { text: recognized, uncertainties: ["Vérifie le signe négatif."] }),
      });
    });
    await page.route("**/api/voice", (route) => route.fulfill({ status: 503, body: "Voix simulée" }));
    await page.route("**/api/nesalio", async (route) => {
      submitted = route.request().postDataJSON().question;
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: fixture });
    });
    await page.goto(url, { waitUntil: "load", timeout: 90_000 });
    const camera = page.getByRole("button", { name: "Ajouter une photo", exact: true });
    await camera.waitFor({ timeout: 90_000 });
    // This button appears after the client effects mount, so file events reach React.
    await mounted(page);
    await page.getByLabel("Photo à expliquer", { exact: true }).setInputFiles({ name: "exercice.png", mimeType: "image/png", buffer: original });
    const exercise = page.locator("form[data-size=large] textarea");
    await exercise.waitFor();
    assert.equal(await exercise.inputValue(), recognized);
    await exercise.scrollIntoViewIfNeeded();
    // Clearing the entire extraction must leave the editor usable.
    assert.ok(await exercise.isEditable());
    await exercise.click({ timeout: 10_000 });
    await exercise.press("ControlOrMeta+A");
    await exercise.press("Backspace");
    assert.equal(await exercise.inputValue(), "");
    assert.ok(await exercise.isVisible());
    assert.ok(await page.getByRole("button", { name: "Demander à Nesa", exact: true }).isDisabled());
    await exercise.fill(recognized.replace("3x", "4x"));
    await exercise.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../analyses/captures/photos/${width}-lecture.png`, fullPage: true });
    await Promise.all([page.waitForRequest("**/api/nesalio"), page.getByRole("button", { name: "Demander à Nesa", exact: true }).click()]);
    assert.ok(submitted.length > 500);
    assert.ok(submitted.includes("4x − 5 = 10"));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
    await camera.waitFor();
    await mounted(page);
    photoFails = true;
    await page.getByLabel("Photo à expliquer", { exact: true }).setInputFiles({ name: "exercice.png", mimeType: "image/png", buffer: original });
    await page.getByRole("alert").filter({ hasText: "photo plus nette" }).waitFor();
    await page.getByRole("button", { name: "Retirer la photo" }).click();
    await page.locator("form[data-size=large] input").fill("Explique les fractions");
    assert.ok(await page.getByRole("button", { name: "Demander à Nesa", exact: true }).isEnabled());
    assert.equal(imageCalls, 2);
    assert.deepEqual(errors, []);
    console.log(`Photo ${width}px : conversion, correction, énoncé long, retrait et erreur vérifiés.`);
    await context.close();
  }
} catch (error) {
  console.error(error);
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: "../analyses/captures/photos/echec.png", fullPage: true, timeout: 5000 }).catch(() => {});
    console.error(
      await activePage
        .locator("main")
        .innerText({ timeout: 5000 })
        .catch(() => "Page devenue inaccessible."),
    );
  }
  throw error;
} finally {
  await browser.close();
}
