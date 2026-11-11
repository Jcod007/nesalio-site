/**
 * Mesures estimées du texte au tableau, en unités du monde de Manim : le moteur place les objets avec, le rendu
 * mesure ensuite le vrai texte quand il le peut. Reprises de l'ancien tableau (board/layout.ts) le 2026-11-10.
 */
import { hasMath, mathSize as texSize } from "./tex";

export interface Extent {
  w: number;
  h: number;
}

/** Tailles de police (points Manim) selon le rôle du texte. */
export const FONT_SIZE = { small: 30, normal: 40, large: 52, calc: 36, label: 34 } as const;

/** Taille des chiffres des graduations (police du texte courant, pas la manuscrite). */
export const TICK_FONT = 20;

/**
 * Mesures de la police manuscrite (Caveat) dans manim-web, relevées dans le navigateur : hauteur = taille / 80,
 * largeur ≈ 0,0039 × taille par caractère. On garde une petite marge pour ne jamais sous-estimer.
 */
const HEIGHT_PER_POINT = 1 / 80;
const WIDTH_PER_POINT_PER_CHAR = 0.0042;

/**
 * Taille d'un texte dans le monde de Manim. Une formule entre dollars (tex.ts) prend la place estimée de la formule
 * rendue : plus large, plus haute pour une fraction. Le rendu fait tenir la formule dans cette boîte.
 */
export function textWorldExtent(text: string, fontSize: number): Extent {
  if (hasMath(text)) {
    const size = texSize(text);
    return { w: size.w * fontSize * WIDTH_PER_POINT_PER_CHAR, h: size.h * fontSize * HEIGHT_PER_POINT };
  }
  const chars = Math.max(1, Array.from(text).length);
  return { w: chars * fontSize * WIDTH_PER_POINT_PER_CHAR, h: fontSize * HEIGHT_PER_POINT };
}

/** Taille d'une matrice écrite au tableau (cases + crochets), partagée par le placement et le dessin. */
export function matrixLayout(rows: readonly (readonly string[])[], fontSize: number) {
  const cell = (text: string) => Math.max(1, Array.from(text).length) * fontSize * WIDTH_PER_POINT_PER_CHAR;
  const columns = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, j) => Math.max(...rows.map((row) => cell(row[j] ?? ""))));
  const gap = fontSize * 0.012;
  const lineHeight = fontSize * HEIGHT_PER_POINT * 1.35;
  const bracket = fontSize * 0.006;
  const width = widths.reduce((a, b) => a + b, 0) + gap * (columns - 1) + 2 * (bracket + gap * 0.6);
  return { widths, gap, lineHeight, bracket, width, height: lineHeight * rows.length };
}

/** Pas de graduation « rond » (1, 2, 5 × 10ⁿ) pour environ `target` graduations. */
export function niceStep(span: number, target = 8): number {
  const raw = span / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const nice = unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10;
  return nice * power;
}
