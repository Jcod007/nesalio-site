import { test } from "vitest";
import assert from "node:assert/strict";
import { programCheck, sessionText } from "./program-check.mjs";

test("cherche dans les dessins et les choix, y compris les mentions interdites", () => {
  const report = { steps: [{ say: "Voici.", do: [{ type: "text", text: "résultat = 4" }], check: { prompt: "Combien ?", choices: ["4", "interdit"] } }] };
  assert.match(sessionText(report), /résultat = 4/);
  assert.deepEqual(programCheck({ mustMention: ["résultat = 4"], mustNotMention: ["interdit"] }, report), {
    score: "1/2",
    ok: 1,
    total: 2,
    misses: ["interdit : interdit"],
  });
});

test("signale les critères manquants et accepte les commandes présentes", () => {
  assert.deepEqual(programCheck({ mustUse: ["axes"], mustMention: ["absent"] }, { lesson: { commands: { axes: 1 } } }), {
    score: "1/2",
    ok: 1,
    total: 2,
    misses: ["non mentionné : absent"],
  });
});
