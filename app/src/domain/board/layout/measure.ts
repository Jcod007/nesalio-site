/**
 * Échelle du repère et taille des textes au tableau : ce que mesure le moteur
 * de placement (coordonnées mathématiques) et que le rendu dessine (monde Manim).
 *
 * Les tailles de texte sont fixes à l'écran (unités du monde Manim) : on les
 * convertit avec l'échelle du repère courant.
 */
import { hasMath, mathSize as texSize } from "@/domain/nesalio/tex";
import type { Frame, TextNode } from "../state";

/** Taille du repère dans le monde de Manim (cadre standard : 14 × 8). Partagée avec le rendu. */
export const AXES_BOX = { width: 11.5, height: 6.4 } as const;

/** Tailles de police (points Manim) selon le rôle du texte. */
export const FONT_SIZE = { small: 30, normal: 40, large: 52, calc: 36, label: 34 } as const;

/**
 * Mesures de la police manuscrite (Caveat) dans manim-web, relevées dans le
 * navigateur : hauteur = taille / 80, largeur ≈ 0,0039 × taille par caractère.
 * On garde une petite marge pour ne jamais sous-estimer.
 */
export const HEIGHT_PER_POINT = 1 / 80;
const WIDTH_PER_POINT_PER_CHAR = 0.0042;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Extent {
  w: number;
  h: number;
}

/* -------------------------------- échelle -------------------------------- */

/**
 * Au-delà de ce rapport entre les échelles naturelles des deux axes, chaque axe
 * prend sa propre échelle : un repère de 0 à 2000 billets et de 0 à 50 000 $
 * n'est plus écrasé en une colonne illisible. En deçà, même échelle en x et
 * en y (angles, cercles et figures restent justes).
 */
export const UNIFORM_RATIO = 3;

/** Unités du monde Manim par unité mathématique, sur chaque axe. */
export function scales(frame: Frame): { x: number; y: number } {
  const x = AXES_BOX.width / (frame.x[1] - frame.x[0]);
  const y = AXES_BOX.height / (frame.y[1] - frame.y[0]);
  if (Math.max(x, y) / Math.min(x, y) > UNIFORM_RATIO) return { x, y };
  const u = Math.min(x, y);
  return { x: u, y: u };
}

/** Le repère a-t-il la même échelle sur les deux axes ? */
export function isUniform(frame: Frame): boolean {
  const s = scales(frame);
  return Math.abs(s.x - s.y) <= 1e-12 * Math.max(s.x, s.y);
}

/** La plus petite des deux échelles (tailles qui doivent rester visibles sur les deux axes). */
export function worldPerMath(frame: Frame): number {
  const s = scales(frame);
  return Math.min(s.x, s.y);
}

/** Une taille donnée en unités du monde (largeur, hauteur), en coordonnées mathématiques. */
export function mathSize(frame: Frame, w: number, h: number): Extent {
  const s = scales(frame);
  return { w: w / s.x, h: h / s.y };
}

export function fontSizeOf(node: TextNode): number {
  return node.role === "calc" ? FONT_SIZE.calc : FONT_SIZE[node.size];
}

/** Taille d'un texte, en coordonnées mathématiques. */
export function textExtent(text: string, fontSize: number, frame: Frame): Extent {
  const world = textWorldExtent(text, fontSize);
  return mathSize(frame, world.w, world.h);
}

/**
 * Taille d'un texte dans le monde de Manim (indépendante du repère). Une formule entre dollars
 * (board/tex.ts) prend la place estimée de la formule rendue : plus large, plus haute pour une
 * fraction. Le rendu fait tenir la formule dans cette boîte.
 */
export function textWorldExtent(text: string, fontSize: number): Extent {
  if (hasMath(text)) {
    const size = texSize(text);
    return { w: size.w * fontSize * WIDTH_PER_POINT_PER_CHAR, h: size.h * fontSize * HEIGHT_PER_POINT };
  }
  const chars = Math.max(1, Array.from(text).length);
  return { w: chars * fontSize * WIDTH_PER_POINT_PER_CHAR, h: fontSize * HEIGHT_PER_POINT };
}

/**
 * Taille d'une matrice écrite au tableau (cases + crochets), en unités du
 * monde : partagée par le moteur (placement) et le rendu (dessin).
 */
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

/** Taille d'un texte au tableau (une matrice prend plusieurs lignes). */
export function textNodeExtent(node: TextNode, frame: Frame): Extent {
  if (!node.rows) return textExtent(node.text, fontSizeOf(node), frame);
  const layout = matrixLayout(node.rows, fontSizeOf(node));
  return mathSize(frame, layout.width, layout.height);
}
