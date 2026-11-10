/**
 * Accented letters manim-web cannot draw in a formula, rewritten with the accents of the base font.
 *
 * Found on 2026-11-10 on real chemistry lessons: `\text{à TPN}`, `\text{entités}` — any accented letter in a
 * formula — stopped the rendering with « MathJax retry » (manim-web 0.39.4 bundles MathJax 4.1.3 with
 * `asyncLoad: null`: the font file of the accented letters, loaded on demand, can never be loaded), and the
 * formula fell back to plain text. The text accents `\'e`, `` \`a `` were shown raw (« entit\'es »): the
 * `textmacros` extension is not in the bundle. Tried in the real renderer: the math accents of the base font
 * over a text letter (`\acute{\text{e}}`) draw the same letter correctly.
 *
 * Letters without such an accent (ç, œ, «, ») are left as written: the formula then falls back to plain text,
 * as before, rather than being misspelt.
 */
const ACCENTS: Record<string, [accent: string, base: string]> = {
  é: ["acute", "e"], É: ["acute", "E"],
  è: ["grave", "e"], à: ["grave", "a"], ù: ["grave", "u"], È: ["grave", "E"], À: ["grave", "A"], Ù: ["grave", "U"],
  ê: ["hat", "e"], â: ["hat", "a"], î: ["hat", "i"], ô: ["hat", "o"], û: ["hat", "u"],
  Ê: ["hat", "E"], Â: ["hat", "A"], Î: ["hat", "I"], Ô: ["hat", "O"], Û: ["hat", "U"],
  ë: ["ddot", "e"], ï: ["ddot", "i"], ü: ["ddot", "u"], Ë: ["ddot", "E"], Ï: ["ddot", "I"], Ü: ["ddot", "U"],
};
const TEXT_ACCENTS: Record<string, string> = { "'": "acute", "`": "grave", "^": "hat", '"': "ddot" };
const COMPOSED = new Map(Object.entries(ACCENTS).map(([letter, [accent, base]]) => [`${accent}:${base}`, letter]));
const TEXT_LIKE = new Set(["text", "mathrm", "textrm", "textbf", "textit", "mbox"]);
const NEEDS_WORK = /[À-ÿ]|\\['`^"]/;

/** `\'e`, `` \`a ``, `\^{o}`, `\"i` (text accents) as the accented letter itself. */
function composeTextAccents(latex: string): string {
  return latex.replace(/\\(['`^"])\s*(?:\{([a-zA-Z])\}|([a-zA-Z]))/g, (whole, mark: string, braced?: string, bare?: string) =>
    COMPOSED.get(`${TEXT_ACCENTS[mark]}:${braced ?? bare}`) ?? whole);
}

export function drawableAccents(latex: string): string {
  if (!NEEDS_WORK.test(latex)) return latex;
  const source = composeTextAccents(latex);
  let out = "";
  /** For each open brace: the text-like command it belongs to, if any. */
  const braces: (string | undefined)[] = [];
  let pending: string | undefined;
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (char === "\\") {
      const name = /^\\([a-zA-Z]+)/.exec(source.slice(i))?.[1];
      if (!name) { out += source.slice(i, i + 2); i++; pending = undefined; continue; }
      out += `\\${name}`;
      i += name.length;
      pending = TEXT_LIKE.has(name) ? name : undefined;
      continue;
    }
    if (char === "{") { braces.push(pending); pending = undefined; out += char; continue; }
    if (char === "}") { braces.pop(); pending = undefined; out += char; continue; }
    if (char !== " ") pending = undefined;
    const accent = ACCENTS[char];
    if (!accent) { out += char; continue; }
    const [mark, base] = accent;
    const text = braces.at(-1);
    // In a text: the text closes, the accented letter stands alone, the text opens again.
    if (text) out += `}\\${mark}{\\${text}{${base}}}\\${text}{`;
    // Nested deeper in a text (rare): the letter without its accent rather than a formula that does not render.
    else if (braces.some(Boolean)) out += base;
    else out += `\\${mark}{\\text{${base}}}`;
  }
  return out;
}
