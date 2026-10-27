/**
 * Vérificateur indépendant de faits numériques explicites dans la narration.
 * Politique conservatrice : une affirmation non reconnue n'est pas déclarée vraie.
 */
import { compileExpression } from "@/domain/math/expr";

const EXPR = String.raw`(?:-?\d+(?:\.\d+)?|\([^()]{1,48}\))(?:\s*[+*×÷/−^-]\s*(?:-?\d+(?:\.\d+)?|\([^()]{1,48}\))){0,8}`;
const EQUALITY = new RegExp(String.raw`(^|[\s:;,(])(${EXPR})\s*=\s*(-?\d+(?:\.\d+)?)(?=$|[\s.,;!?])`, "g");
const POWER = /(-?\d+(?:\.\d+)?)\s*(?:²|\^2)\s*=\s*(-?\d+(?:\.\d+)?)/g;
const ROOT = /(?:√\s*\(?\s*|sqrt\s*\(\s*)(\d+(?:\.\d+)?)\s*\)?\s*=\s*(-?\d+(?:\.\d+)?)/gi;

function close(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function verifyNumericalClaims(text: string): string | undefined {
  // Une égalité complexe non prise en charge est laissée au contrôle pédagogique ultérieur.
  for (const match of text.matchAll(EQUALITY)) {
    // Ne pas interpréter le terme numérique d'une équation symbolique comme une égalité autonome.
    const preceding = text.slice(Math.max(0, (match.index ?? 0) - 32), (match.index ?? 0) + (match[1]?.length ?? 0));
    if (/[a-zA-Z]\s*[+*/×÷−-]\s*$/.test(preceding)) continue;
    const expression = match[2] ?? "";
    const result = match[3] ?? "";
    try {
      const value = compileExpression(expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-"))(0);
      if (!close(value, Number(result))) return `Égalité numérique incorrecte : ${expression} = ${result}`;
    } catch {
      // Syntaxe non reconnue : aucune conclusion de validité.
    }
  }
  for (const match of text.matchAll(POWER)) {
    if (!close(Number(match[1]) ** 2, Number(match[2]))) return "Carré numérique incorrect";
  }
  for (const match of text.matchAll(ROOT)) {
    if (!close(Math.sqrt(Number(match[1])), Number(match[2]))) return "Racine carrée incorrecte";
  }
}

export function verifyGeometryClaims(text: string): string | undefined {
  // Vérification des valeurs explicitement chiffrées de Pythagore.
  const triangle = /(?:pythagore|hypoténuse)[^.!?]{0,100}?(\d+(?:\.\d+)?)\s*(?:et|,)\s*(\d+(?:\.\d+)?)\s*(?:donne|=|vaut|est)\s*(\d+(?:\.\d+)?)/gi;
  for (const match of text.matchAll(triangle)) {
    const a = Number(match[1]), b = Number(match[2]), c = Number(match[3]);
    if (!close(Math.hypot(a, b), c)) return "Longueur de l'hypoténuse incorrecte";
  }
}
