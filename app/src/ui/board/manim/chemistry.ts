import { mhchemParser } from "mhchemparser";

/**
 * manim-web renders formulas with its own bundled MathJax, whose package list
 * (base, ams, newcommand, configmacros) has no mhchem. `\ce{…}` and `\pu{…}`
 * are therefore converted beforehand by mhchemParser, the parser mhchem itself
 * uses, into base LaTeX. Only the equilibrium arrows are missing from base/ams:
 * they are supplied as macros to MathTex.
 */
export const CHEM_MACROS: Record<string, string> = {
  longrightleftharpoons: "\\mathrel{\\rightleftharpoons}",
  longRightleftharpoons: "\\mathrel{\\rightleftharpoons}",
  longLeftrightharpoons: "\\mathrel{\\rightleftharpoons}",
  longleftrightarrows: "\\mathrel{\\rightleftarrows}",
};

const COMMAND = /\\(ce|pu)\s*\{/g;

/** Replaces each `\ce{…}` / `\pu{…}` (balanced braces) by its base LaTeX; anything unreadable is left as written. */
export function expandChemistry(tex: string): string {
  if (!tex.includes("\\ce") && !tex.includes("\\pu")) return bareArrows(tex);
  let out = "";
  let i = 0;
  COMMAND.lastIndex = 0;
  for (let match = COMMAND.exec(tex); match; match = COMMAND.exec(tex)) {
    const open = match.index + match[0].length - 1;
    let depth = 0, end = open;
    for (; end < tex.length; end++) {
      if (tex[end] === "\\") { end++; continue; }
      if (tex[end] === "{") depth++;
      else if (tex[end] === "}" && --depth === 0) break;
    }
    if (end >= tex.length) break;
    let converted: string;
    try {
      const inner = tex.slice(open + 1, end);
      // French decimals: mhchem reads « 58,44 » itself, but « 58{,}44 » (the comma written for LaTeX) came out
      // as « 58 ,⁴⁴ » — the three main results of a real lesson on 2026-11-10.
      converted = mhchemParser.toTex(match[1] === "pu" ? inner.replace(/(\d)\{,\}(?=\d)/g, "$1,") : inner, match[1] as "ce" | "pu");
    } catch {
      converted = tex.slice(match.index, end + 1);
    }
    out += bareArrows(tex.slice(i, match.index)) + `{${converted}}`;
    i = end + 1;
    COMMAND.lastIndex = i;
  }
  return out + bareArrows(tex.slice(i));
}

/**
 * A reaction arrow typed between two `\ce{…}` (« 4\ce{FeS2} + 11\ce{O2} -> 2\ce{Fe2O3} »), outside the chemistry
 * notation: LaTeX draws « − > ». Seen on a real lesson (2026-11-10). Left alone inside a text.
 */
function bareArrows(tex: string): string {
  if (!tex.includes("->") && !tex.includes("<=>")) return tex;
  return tex.split(/(\\(?:text|mathrm|textrm|mbox)\s*\{[^{}]*\})/).map((piece, index) => index % 2 ? piece
    : piece.replace(/<=>/g, "\\rightleftharpoons ").replace(/(?<![<-])-+>/g, "\\longrightarrow ")).join("");
}
