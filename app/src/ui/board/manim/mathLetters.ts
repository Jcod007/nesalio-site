/**
 * Letters manim-web cannot draw in math mode, rewritten as a glyph it can. Found on 2026-11-09 in a real
 * lesson (« PV = nRT », pression) that stopped with « Dimensions de scène invalides » : the italic `p`
 * of MathJax's font comes back with NaN dimensions in manim-web 0.39.4 and 0.41.0 (`q`, `V`, `x` are
 * fine), so any formula with a `p` broke the whole lesson. `\mathit{p}` draws the same italic letter
 * through another path and measures correctly. Command names (`\pi`, `\approx`) and the content of
 * text-like commands (`\text{pression}`, already fine) are left as they are.
 */
const BROKEN = /p/;
const TEXT_LIKE = new Set(["text", "mathrm", "mathit", "mathbf", "mathsf", "mathtt", "textrm", "textbf", "mbox", "operatorname"]);

export function drawableMathLetters(latex: string): string {
  if (!BROKEN.test(latex)) return latex;
  let out = "";
  for (let i = 0; i < latex.length; i++) {
    const char = latex[i]!;
    if (char === "\\") {
      const name = /^\\([a-zA-Z]+)/.exec(latex.slice(i))?.[1];
      if (!name) {
        out += latex.slice(i, i + 2);
        i++;
        continue;
      }
      out += `\\${name}`;
      i += name.length;
      // A text-like command: its braced argument is copied as is.
      if (TEXT_LIKE.has(name)) {
        let j = i + 1;
        while (latex[j] === " ") j++;
        if (latex[j] === "{") {
          let depth = 0;
          for (let k = j; k < latex.length; k++) {
            if (latex[k] === "{") depth++;
            else if (latex[k] === "}" && --depth === 0) {
              out += latex.slice(i + 1, k + 1);
              i = k;
              break;
            }
          }
        }
      }
      continue;
    }
    out += char === "p" ? "\\mathit{p}" : char;
  }
  return out;
}
