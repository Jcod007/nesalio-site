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
  if (!tex.includes("\\ce") && !tex.includes("\\pu")) return tex;
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
      converted = mhchemParser.toTex(tex.slice(open + 1, end), match[1] as "ce" | "pu");
    } catch {
      converted = tex.slice(match.index, end + 1);
    }
    out += tex.slice(i, match.index) + `{${converted}}`;
    i = end + 1;
    COMMAND.lastIndex = i;
  }
  return out + tex.slice(i);
}
