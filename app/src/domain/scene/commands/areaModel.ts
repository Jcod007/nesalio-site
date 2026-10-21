/**
 * Modèle d'aire (SN 4, 1re étape) : multiplier deux polynômes, factoriser un
 * trinôme, compléter le carré. Le modèle donne les termes des deux facteurs
 * (« x », « 2 », « 3x », « −4 ») ; le moteur dessine le rectangle découpé, une
 * pièce par produit de deux termes, avec ce produit écrit DANS la pièce, et les
 * termes le long des côtés. Il calcule les produits lui-même : pas d'erreur de
 * signe ou d'exposant au tableau.
 * Redemander la même figure avec "empty" vide (ou d'autres termes) la fait
 * évoluer : le coin manquant de la complétion du carré se remplit.
 */
import { z } from "zod";
import { type BoardNode, type Vec2 } from "@/domain/board/state";
import { ColorName } from "../primitives";
import { base } from "./figure";
import { defineCommand } from "./define";
import { drawFigure, label, ShapeId, type Color } from "./parts";

/** Un terme de degré 0 ou 1 en x : « x », « −3x », « 2 », « 0,5x ». */
export interface Term {
  coef: number;
  degree: 0 | 1;
}

const TERM = /^([+\-−]?)\s*(\d+(?:[.,]\d+)?)?\s*(x?)$/;

export function parseTerm(source: string): Term | null {
  const match = TERM.exec(source.trim());
  if (!match) return null;
  const [, sign, digits, x] = match;
  if (!digits && !x) return null;
  const value = digits ? Number(digits.replace(",", ".")) : 1;
  if (!(value > 0)) return null;
  return { coef: (sign === "-" || sign === "−" ? -1 : 1) * value, degree: x ? 1 : 0 };
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000).replace(".", ",");

/** Produit de deux termes, écrit comme en classe : 6, −3x, x², 2x². */
export function termProduct(a: Term, b: Term): string {
  const coef = a.coef * b.coef;
  const degree = a.degree + b.degree;
  const power = degree === 0 ? "" : degree === 1 ? "x" : "x²";
  const sign = coef < 0 ? "−" : "";
  const magnitude = Math.abs(coef);
  return `${sign}${magnitude === 1 && degree > 0 ? "" : fmt(magnitude)}${power}`;
}

/** Longueur dessinée d'un terme : x vaut 3 unités, une constante sa valeur (assez grande pour qu'on la voie). */
const X_LENGTH = 3;
const lengthOf = (t: Term) => Math.max(0.7, Math.abs(t.coef) * (t.degree === 1 ? X_LENGTH : 1));

const TermText = z
  .string()
  .trim()
  .min(1)
  .max(8)
  .refine((s) => parseTerm(s) !== null, { message: "Terme : « x », « 3x », « −2 »… (degré 0 ou 1)" });
const Terms = z.array(TermText).min(1).max(3);
const Cell = z.tuple([z.number().int().min(0).max(2), z.number().int().min(0).max(2)]);

export const areaModelCommand = defineCommand({
  schema: z.object({
    type: z.literal("areaModel"),
    id: ShapeId,
    rows: Terms,
    cols: Terms,
    empty: z.array(Cell).max(4).optional(),
    at: z.tuple([z.number().finite(), z.number().finite()]).optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"areaModel","id":"am","rows":["x","2"],"cols":["x","3"]} : MODÈLE D\'AIRE de (x + 2)(x + 3) : un rectangle\n' +
    '  découpé, une pièce par produit (x², 3x, 2x, 6) écrit DANS la pièce, calculé par le moteur ; les termes le long des\n' +
    '  côtés. Termes de degré 0 ou 1 (« 2x », « −4 »). "empty":[[1,1]] laisse une pièce vide en pointillé (« ? ») : le\n' +
    '  coin à compléter du carré ; redemande le même id sans "empty" pour la remplir. Parties : am-p00, am-p01… (pièce\n' +
    '  ligne, colonne), am-r0… et am-c0… (termes des côtés). Pour assembler des pièces en rectangle : "move" des pièces.',
  duration: (action) => 600 + 450 * action.rows.length * action.cols.length,
  aliases: ["area_model", "tuiles", "algebraTiles", "aireModele", "rectangleModel"],
  apply(state, action, reveal) {
    const rows = action.rows.map((r) => parseTerm(r)!);
    const cols = action.cols.map((c) => parseTerm(c)!);
    const widths = cols.map(lengthOf);
    const heights = rows.map(lengthOf);
    const origin: Vec2 = action.at ?? [0, 0];
    const empty = new Set((action.empty ?? []).map(([r, c]) => `${r}${c}`));
    const id = action.id;
    const parts: BoardNode[] = [];
    let y = origin[1];
    rows.forEach((row, i) => {
      let x = origin[0];
      const h = heights[i]!;
      cols.forEach((col, j) => {
        const w = widths[j]!;
        const pieceId = `${id}-p${i}${j}`;
        const hole = empty.has(`${i}${j}`);
        const degree = row.degree + col.degree;
        const negative = row.coef * col.coef < 0;
        const color: Color = action.color ?? (negative ? "muted" : degree === 2 ? "violet" : degree === 1 ? (i === 0 ? "blue" : "green") : "orange");
        const points: Vec2[] = [
          [x, y],
          [x + w, y],
          [x + w, y - h],
          [x, y - h],
        ];
        // Le produit est l'étiquette de la pièce : le moteur la pose au centre, dans la pièce.
        parts.push(
          hole
            ? { ...base(pieceId, reveal, "muted"), type: "polygon", points, closed: true, dashed: true, label: "?" }
            : { ...base(pieceId, reveal, color), type: "polygon", points, closed: true, fill: true, label: termProduct(row, col) },
        );
        x += w;
      });
      y -= h;
    });
    // Termes des facteurs : au-dessus des colonnes, à gauche des lignes.
    let x = origin[0];
    cols.forEach((_, j) => {
      parts.push(label(`${id}-c${j}`, action.cols[j]!.replace("-", "−"), [x + widths[j]! / 2, origin[1] + 0.45], `${id}-p0${j}`, reveal, "ink"));
      x += widths[j]!;
    });
    y = origin[1];
    rows.forEach((_, i) => {
      parts.push(label(`${id}-r${i}`, action.rows[i]!.replace("-", "−"), [origin[0] - 0.55, y - heights[i]! / 2], `${id}-p${i}0`, reveal, "ink"));
      y -= heights[i]!;
    });
    return drawFigure(state, id, parts, reveal);
  },
});
