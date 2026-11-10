/**
 * « Elle dit des choses qui n'arrivent jamais au tableau » : passages (beats) où Nesa parle sans qu'aucun
 * objet n'apparaisse ni ne soit surligné, et nombres dits dans la voix mais absents de tout ce qui est écrit.
 * Usage : node analyses/camera/dit-sans-ecrit.mjs (lit les mêmes leçons que l'audit caméra).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DIRS = ["banc/ap2-allegees", "banc/ap3-relecteur", "banc/ap3n-sans", "banc/ap3n-relecteur", "banc/coupees-apres", "banc/coupees-apres-nouvelles", "lecons-jouees"];
const VISUAL = new Set(["show", "write", "draw", "transform", "highlight", "animate_parameter", "move"]);
const UNITS = ["zéro", "un", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const TENS = { vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, mille: 1000 };

/** Digits written in a text (formulas, labels, tables), as plain numbers. */
const written = (text) => (text.replace(/\{,\}/g, ",").match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));

/** Numbers said in words, roughly: « trois virgule sept trois » → 3.73, « vingt-deux » → 22. */
function spoken(say) {
  const words = say.toLowerCase().replace(/[-']/g, " ").split(/[^a-zéèêàçû]+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const unit = UNITS.indexOf(words[i]);
    const ten = TENS[words[i]];
    if (unit < 0 && ten === undefined) continue;
    let value = unit >= 0 ? (words[i] === "une" ? 1 : unit) : ten;
    if (ten !== undefined && UNITS.indexOf(words[i + 1]) > 0) { value += UNITS.indexOf(words[i + 1]); i++; }
    if (words[i + 1] === "virgule" && UNITS.indexOf(words[i + 2]) >= 0) {
      let decimals = "";
      let j = i + 2;
      while (UNITS.indexOf(words[j]) >= 0 && UNITS.indexOf(words[j]) < 10) { decimals += UNITS.indexOf(words[j]); j++; }
      value = Number(`${value}.${decimals}`);
      i = j - 1;
    }
    // « un » and « une » are mostly articles: only a number with a decimal part or above 1 counts.
    if (value > 1 || !Number.isInteger(value)) out.push(value);
  }
  return out;
}

let lessons = 0, beats = 0, silentBeats = 0, numbersSaid = 0, numbersMissing = 0;
const worst = [];
for (const dir of DIRS) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) continue;
  for (const file of readdirSync(full).filter((f) => f.endsWith(".json") && !f.startsWith("rapport"))) {
    const lesson = JSON.parse(readFileSync(join(full, file), "utf8"));
    if (!lesson.slices?.length) continue;
    lessons++;
    const board = lesson.slices.flatMap((s) => (s.introduces ?? []).map((o) => JSON.stringify(o.content ?? o.params ?? "")));
    const shown = new Set(board.flatMap(written));
    let silent = 0, missing = [];
    lesson.slices.forEach((slice, si) => (slice.beats ?? []).forEach((beat, bi) => {
      beats++;
      if (si === 0 && bi === 0) return; // the hook speaks before anything is drawn, by design
      if (!(beat.do ?? []).some((a) => VISUAL.has(a.verb))) { silentBeats++; silent++; }
      for (const n of spoken(beat.say)) {
        numbersSaid++;
        if (![...shown].some((m) => Math.abs(m - n) < 1e-9)) { numbersMissing++; missing.push(n); }
      }
    }));
    worst.push({ file: `${dir}/${file}`, silent, missing: [...new Set(missing)] });
  }
}
const lines = [
  "# Dit mais pas montré au tableau", "",
  `Leçons : ${lessons} ; passages : ${beats}.`,
  `- Passages sans rien qui apparaisse ni ne s'éclaire au tableau (hors accroche) : ${silentBeats} (${(100 * silentBeats / beats).toFixed(1)} %).`,
  `- Nombres dits (approximation, en mots) : ${numbersSaid} ; absents de tout ce qui est écrit : ${numbersMissing} (${(100 * numbersMissing / Math.max(1, numbersSaid)).toFixed(1)} %).`,
  "", "## Leçons les plus touchées", "",
  ...worst.sort((a, b) => (b.silent * 3 + b.missing.length) - (a.silent * 3 + a.missing.length)).slice(0, 20)
    .map((w) => `- ${w.file} : ${w.silent} passage(s) muet(s) au tableau ; nombres dits non écrits : ${w.missing.slice(0, 8).join(", ") || "—"}`),
];
writeFileSync(join(ROOT, "camera", "dit-sans-ecrit.md"), lines.join("\n"));
console.log(lines.slice(0, 6).join("\n"));
