/**
 * Écriture mathématique au tableau : le modèle met les formules entre dollars
 * (« aire = $\frac{b \times h}{2}$ », « $\sqrt{25} = 5$ »). Le rendu les dessine
 * avec MathJax (vraies fractions, racines, exposants) ; le moteur, lui, doit
 * connaître la taille de la formule pour la placer sans chevauchement : on
 * l'estime ici, un peu large, et le rendu fait tenir la formule dans cette boîte.
 *
 * Fonctions pures, sans dépendance au rendu.
 */

/** Le texte contient-il une formule entre dollars ? */
export function hasMath(text: string): boolean {
  return /\$[^$]+\$/.test(text);
}

const TEXT_ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "%": "\\%",
  "#": "\\#",
  "&": "\\&",
  _: "\\_",
  "^": "\\^{}",
  "~": "\\~{}",
};

/** Le texte entier en LaTeX : les morceaux hors dollars deviennent du texte (\text{…}). */
export function toLatex(text: string): string {
  return text
    .split(/(\$[^$]+\$)/)
    .filter((part) => part.length > 0)
    .map((part) =>
      part.startsWith("$") && part.endsWith("$") && part.length > 1
        ? part.slice(1, -1)
        : `\\text{${part.replace(/[\\{}%#&_^~]/g, (c) => TEXT_ESCAPES[c]!)}}`,
    )
    .join("");
}

const SYMBOLS: Record<string, string> = {
  times: "×",
  cdot: "·",
  div: "÷",
  pi: "π",
  theta: "θ",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  lambda: "λ",
  mu: "μ",
  sigma: "σ",
  omega: "ω",
  varphi: "φ",
  phi: "φ",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  pm: "±",
  infty: "∞",
  circ: "°",
  degree: "°",
  to: "→",
  rightarrow: "→",
  Rightarrow: "⇒",
  in: "∈",
  angle: "∠",
  parallel: "∥",
  perp: "⊥",
  triangle: "△",
  sim: "∼",
  cong: "≅",
};
const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", n: "ⁿ", x: "ˣ" };

/** Un argument entre accolades (ou un seul caractère) à partir de `i` : [contenu, indice suivant]. */
function readGroup(s: string, i: number): [string, number] {
  while (s[i] === " ") i++;
  if (s[i] === "\\") {
    // Un argument sans accolades peut être une commande : « 60^\circ ».
    const name = /^\\[a-zA-Z]+/.exec(s.slice(i))?.[0] ?? s.slice(i, i + 2);
    return [name, i + name.length];
  }
  if (s[i] !== "{") return [s[i] ?? "", i + 1];
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

/** Version lisible en texte simple d'une formule LaTeX (résumés, consignes, sous-titres). */
export function plainMath(tex: string): string {
  let out = "";
  for (let i = 0; i < tex.length; ) {
    const c = tex[i]!;
    if (c === "\\") {
      const name = /^[a-zA-Z]+/.exec(tex.slice(i + 1))?.[0] ?? tex[i + 1] ?? "";
      i += 1 + name.length;
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const [num, a] = readGroup(tex, i);
        const [den, b] = readGroup(tex, a);
        const wrap = (x: string) => (/^[\w.,]+$/.test(x) ? x : `(${x})`);
        out += `${wrap(plainMath(num))}/${wrap(plainMath(den))}`;
        i = b;
      } else if (name === "sqrt") {
        const [arg, a] = readGroup(tex, i);
        out += `√${/^[\w.,]+$/.test(plainMath(arg)) ? plainMath(arg) : `(${plainMath(arg)})`}`;
        i = a;
      } else if (name === "text" || name === "mathrm" || name === "textbf" || name === "operatorname") {
        const [arg, a] = readGroup(tex, i);
        out += arg.replace(/\\([{}%#&_])/g, "$1");
        i = a;
      } else if (name === "left" || name === "right" || name === "," || name === ";" || name === "!" || name === "quad") {
        out += name === "quad" ? " " : "";
      } else if (name in SYMBOLS) {
        out += SYMBOLS[name];
      } else if (["sin", "cos", "tan", "log", "ln", "exp"].includes(name)) {
        out += name;
      } else if (name.length === 1) {
        out += name; // \{ \} \% …
      }
    } else if (c === "^" || c === "_") {
      const [arg, a] = readGroup(tex, i + 1);
      const plain = plainMath(arg);
      if (c === "^" && [...plain].every((ch) => ch in SUPERSCRIPT)) out += [...plain].map((ch) => SUPERSCRIPT[ch]).join("");
      else if (c === "^" && plain === "°") out += "°";
      else out += c === "^" ? `^${plain.length > 1 ? `(${plain})` : plain}` : plain;
      i = a;
    } else if (c === "{" || c === "}") {
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out.replace(/\{,\}/g, ",");
}

/** Le texte avec ses formules en texte simple. */
export function plainText(text: string): string {
  return hasMath(text) ? text.replace(/\$([^$]+)\$/g, (_, tex: string) => plainMath(tex)) : text;
}

/**
 * Taille d'une formule, en « caractères » de large et en « lignes » de haut
 * (un caractère et une ligne du texte manuscrit de même taille). Estimation
 * volontairement un peu large : le rendu fait tenir la formule dedans.
 */
interface Size {
  w: number;
  h: number;
}
const MATH_CHAR = 1.25; // une lettre de formule est plus large qu'une lettre manuscrite

function measure(tex: string): Size {
  let w = 0;
  let h = 1;
  for (let i = 0; i < tex.length; ) {
    const c = tex[i]!;
    if (c === "\\") {
      const name = /^[a-zA-Z]+/.exec(tex.slice(i + 1))?.[0] ?? tex[i + 1] ?? "";
      i += 1 + name.length;
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const [num, a] = readGroup(tex, i);
        const [den, b] = readGroup(tex, a);
        const n = measure(num);
        const d = measure(den);
        w += Math.max(n.w, d.w) * 0.85 + 0.6;
        h = Math.max(h, (n.h + d.h) * 0.85 + 0.2);
        i = b;
      } else if (name === "sqrt") {
        const [arg, a] = readGroup(tex, i);
        const m = measure(arg);
        w += m.w + 1.1;
        h = Math.max(h, m.h * 1.15);
        i = a;
      } else if (name === "text" || name === "mathrm" || name === "textbf" || name === "operatorname") {
        const [arg, a] = readGroup(tex, i);
        w += Array.from(arg.replace(/\\(.)/g, "$1")).length;
        i = a;
      } else if (name === "left" || name === "right") {
        // la parenthèse qui suit compte comme un caractère
      } else if (name === "," || name === ";" || name === "!") {
        w += 0.25;
      } else if (name === "quad") {
        w += 1;
      } else if (["sin", "cos", "tan", "log", "ln", "exp"].includes(name)) {
        w += name.length * 0.9;
      } else {
        w += 1;
      }
    } else if (c === "^" || c === "_") {
      const [arg, a] = readGroup(tex, i + 1);
      const m = measure(arg);
      w += m.w * 0.7;
      h = Math.max(h, 1 + m.h * 0.45);
      i = a;
    } else if (c === "{" || c === "}") {
      i++;
    } else if (c === " ") {
      w += 0.3;
      i++;
    } else {
      w += /[=+−\-×<>≤≥]/.test(c) ? 1.6 : 1;
      i++;
    }
  }
  return { w, h };
}

/** Taille du texte entier (texte et formules), en caractères manuscrits et en lignes. */
export function mathSize(text: string): Size {
  const m = measure(toLatex(text));
  return { w: Math.max(1, m.w * MATH_CHAR), h: m.h };
}
