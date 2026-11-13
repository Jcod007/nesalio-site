/**
 * Crée des codes crédit à usage unique (voir src/server/dailyQuota.ts).
 *
 *   node tools/codes-credit.mjs 6
 *   node tools/codes-credit.mjs 6 <empreintes déjà en place>   (ajoute aux codes existants)
 *
 * Affiche les codes à distribuer (à ne jamais versionner) et la valeur de
 * NESALIO_CODES_CREDIT : les empreintes SHA-256, seules à aller dans Vercel.
 * Un code déjà distribué reste valable tant que son empreinte reste dans la liste ;
 * une fois utilisé, Redis le refuse définitivement.
 */
import { createHash, randomInt } from "node:crypto";

// Sans 0/O ni 1/I/L : lisible à voix haute et sur papier.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const count = Number(process.argv[2] ?? 6);
const existing = (process.argv[3] ?? "").split(/[\s,]+/).filter((h) => /^[0-9a-f]{64}$/i.test(h));
if (!Number.isInteger(count) || count < 1 || count > 1000) {
  console.error("Usage : node tools/codes-credit.mjs <nombre de codes> [empreintes existantes]");
  process.exit(1);
}

const code = () => {
  const raw = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
};
const hash = (value) => createHash("sha256").update(value.toUpperCase().replace(/[\s-]/g, "")).digest("hex");

const codes = Array.from({ length: count }, code);
console.log("Codes à distribuer (chacun ne sert qu'une fois) :");
for (const c of codes) console.log(`  ${c}`);
console.log("\nNESALIO_CODES_CREDIT=" + [...existing, ...codes.map(hash)].join(","));
