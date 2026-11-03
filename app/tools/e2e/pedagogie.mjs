/** Transport et interface pédagogiques avec flux simulés ; aucun appel au modèle. */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
try {
  for (const viewport of [{ width: 1366, height: 800 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/voice", (route) => route.fulfill({ status: 503, body: "" }));
    await page.route("**/api/tutor", async (route) => {
      const request = route.request().postDataJSON();
      requests.push(request);
      const arithmetic = request.question === "Vérifie le calcul." || request.context?.originalQuestion === "Vérifie le calcul.";
      const events = arithmetic ? request.mode === "question" ? [
        { kind: "source", source: "model" }, { kind: "lesson", title: "Calcul autonome" },
        { kind: "plan", plan: { goal: "Calculer", target: "calcul", concepts: [{ id: "calcul", label: "Calcul", prerequisites: [] }] } },
        { kind: "step", say: "À toi de calculer.", do: [], teaching: { concept: "calcul", role: "independent-practice", activityId: "calcul-1", purpose: "practice" },
          check: { prompt: "Deux fois la somme de un et deux ?", choices: ["4", "6"], answer: 1,
            verification: { kind: "arithmetic", expression: "2*(1+2)" } } }, { kind: "await" },
      ] : [
        { kind: "source", source: "model" }, { kind: "step", say: "Le calcul donne bien six.", do: [] },
        { kind: "end", summary: ["Une tentative autonome observée"] },
      ] : request.mode === "question" ? [
        { kind: "source", source: "model" }, { kind: "lesson", title: "Fractions" },
        { kind: "plan", plan: { goal: "Comprendre les parts", target: "fractions.parts", concepts: [{ id: "fractions.parts", label: "Parts égales", prerequisites: [] }] } },
        { kind: "step", say: "Quatre parts égales.", do: [], teaching: { concept: "fractions.parts", role: "explanation", completes: true } },
        { kind: "step", say: "Trois parts sur quatre : trois quarts.", do: [], teaching: { concept: "fractions.parts", role: "worked-example", completes: true } },
        { kind: "end", summary: ["Des parts égales"] },
      ] : request.mode === "followUp" ? [
        { kind: "source", source: "model" },
        { kind: "step", say: "À toi.", do: [], teaching: { concept: "fractions.parts", role: "guided-practice" },
          check: { prompt: "Le 4 désigne quoi ?", choices: ["Le partage", "Les parts prises"], answer: 0 } },
        { kind: "await" },
      ] : [
        { kind: "source", source: "model" },
        { kind: "step", say: "Je partage en quatre. Je prends trois parts : trois quarts.", do: [], teaching: { concept: "fractions.parts", role: "worked-example", completes: true } },
        { kind: "end", summary: ["Le 4 décrit le partage"] },
      ];
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((event) => JSON.stringify(event)).join("\n") + "\n" });
    });
    await page.goto(process.env.NESALIO_URL ?? "http://localhost:3101", { waitUntil: "networkidle" });
    await page.locator("form[data-size=large] input").fill("Explique les fractions.");
    await page.locator("form[data-size=large] input").press("Enter");
    await page.getByRole("button", { name: "Continuer avec Nesa", exact: true }).click({ timeout: 45_000 });
    assert.equal(requests[1]?.mode, "followUp");
    assert.equal(requests[1]?.context?.plan?.target, "fractions.parts");
    assert.deepEqual(requests[1]?.context?.learning?.concepts[0]?.presented, ["explanation", "worked-example"]);
    await page.getByRole("button", { name: "Montre-moi d'abord", exact: true }).click({ timeout: 30_000 });
    await page.getByRole("button", { name: "Continuer avec Nesa", exact: true }).waitFor({ timeout: 45_000 });
    assert.equal(requests[2]?.mode, "continue");
    assert.equal(requests[2]?.answer?.correct, null);
    assert.equal(requests[2]?.answer?.concept, "fractions.parts");
    assert.equal(requests[2]?.context?.learning?.concepts[0]?.observations[0]?.outcome, "help-requested");
    assert.equal(requests[2]?.context?.learning?.recent[0]?.outcome, "help-requested");
    assert.equal(requests[2]?.context?.plan?.target, "fractions.parts");

    // Les métadonnées traversent le vrai lecteur et le transport ; la réponse libre est calculée côté domaine.
    await page.getByRole("button", { name: "Nouvelle notion", exact: true }).click();
    await page.locator("form[data-size=large] input").fill("Vérifie le calcul.");
    await page.locator("form[data-size=large] input").press("Enter");
    const answer = page.getByPlaceholder("Ou réponds avec tes mots…");
    await answer.fill("3+3", { timeout: 45_000 });
    await answer.press("Enter");
    await page.getByRole("button", { name: "Continuer avec Nesa", exact: true }).waitFor({ timeout: 45_000 });
    const continuation = requests.at(-1);
    assert.equal(continuation?.mode, "continue");
    assert.equal(continuation?.answer?.correct, true);
    assert.equal(continuation?.answer?.method, "arithmetic");
    assert.equal(continuation?.answer?.support, "independent");
    assert.equal(continuation?.context?.learning?.concepts[0]?.observations[0]?.format, "free");
    assert.equal(continuation?.context?.learning?.concepts[0]?.observations[0]?.activityId, "calcul-1");
    assert.ok(continuation?.context?.learning?.concepts[0]?.observations[0]?.at > 0);
    assert.deepEqual(errors, []);
    await context.close();
    process.stdout.write(`Pédagogie OK (${viewport.width} × ${viewport.height}, flux simulés).\n`);
  }
} finally { await browser.close(); }
