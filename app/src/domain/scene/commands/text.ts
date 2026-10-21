/**
 * Commandes d'écriture : textes posés dans la figure (à côté d'un objet, ou à
 * une position), lignes de calcul écrites sur le tableau, étiquette de
 * diagnostic.
 */
import { z } from "zod";
import { bodyBox, makeRoomInCalc, nextCalcSlot, placeBeside, placeText, textExtent, FONT_SIZE, union } from "@/domain/board/layout";
import { plainText } from "@/domain/board/tex";
import { isVisible, putNode, resolveTargets, type BoardState, type Reveal, type TextNode, type Vec2 } from "@/domain/board/state";
import { BoardText, ColorName, Coord, Id, ShortText, Side, TextSize } from "../primitives";
import { defineCommand } from "./define";

const writingTime = (text: string, base: number) => base + 32 * plainText(text).length;

/** Ajoute une ligne en bas de la pile de calculs (en faisant de la place si elle est pleine). */
export function writeCalcLine(state: BoardState, id: string, text: string, reveal: Reveal, color?: z.infer<typeof ColorName>): BoardState {
  const existing = state.nodes[id];
  if (isVisible(existing) && existing.type === "text" && existing.role === "calc") {
    // Même identifiant : la ligne se réécrit sur place (transformation).
    return putNode(state, { ...existing, text, color: color ?? existing.color, morph: reveal });
  }
  let next = makeRoomInCalc({ ...state, calc: state.calc.filter((c) => c !== id) }, reveal);
  const node: TextNode = {
    id,
    type: "text",
    text,
    at: nextCalcSlot(next, text),
    align: "left",
    size: "normal",
    role: "calc",
    color,
    reveal,
    offset: [0, 0],
  };
  next = putNode(next, node);
  return { ...next, calc: [...next.calc, id] };
}

export const textCommand = defineCommand({
  schema: z.object({
    type: z.literal("text"),
    id: Id,
    text: BoardText,
    at: Coord.optional(),
    near: Id.optional(),
    side: Side.optional(),
    size: TextSize.optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"text","id":"t","text":"…","near":"A","side":"right|left|above|below","size":"small|normal|large","color":"…"}\n' +
    '  Texte ou équation écrit DANS la figure, à côté de l\'objet "near" (le moteur évite les chevauchements ;\n' +
    '  le texte suit l\'objet s\'il bouge et disparaît avec lui). Ou "at":[x,y] pour une position précise.',
  duration: (action) => writingTime(action.text, 500),
  aliases: ["label", "annotation", "equation"],
  apply(state, action, reveal) {
    const targets = action.near ? resolveTargets(state, action.near) : [];
    if (targets.length === 0 && !action.at) {
      // Ni objet ni position : la ligne va dans la pile de calculs.
      return writeCalcLine(state, action.id, action.text, reveal, action.color);
    }
    const size = action.size ?? "normal";
    const extent = textExtent(action.text, FONT_SIZE[size], state.frame);
    let at: Vec2;
    let anchor: TextNode["anchor"];
    if (targets.length > 0) {
      const target = union(targets.map((id) => bodyBox(state.nodes[id]!, state.frame)))!;
      const placed = placeBeside(state, extent, target, action.side, new Set([...targets, action.id]), new Set(targets));
      at = placed.center;
      anchor = { target: action.near!, side: placed.side };
    } else {
      // Position demandée ; si elle est prise, le texte se pose à la place libre la plus proche.
      at = action.at!;
    }
    const node: TextNode = {
      id: action.id,
      type: "text",
      text: action.text,
      at,
      align: "center",
      size,
      role: "free",
      anchor,
      color: action.color,
      reveal,
      offset: [0, 0],
    };
    const rest = { ...state, calc: state.calc.filter((c) => c !== action.id) };
    return putNode(rest, anchor ? node : placeText(rest, node));
  },
});

export const noteCommand = defineCommand({
  schema: z.object({
    type: z.literal("note"),
    id: Id.optional(),
    text: BoardText,
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"note","id":"n1","text":"x = 2 ± √3"} : ligne de calcul, écrite sur le tableau en colonne à côté de la figure\n' +
    '  (utilise ², √, ±, π, ≈, ÷, ×). Quand la colonne est pleine, les anciennes lignes remontent et s\'effacent.',
  duration: (action) => writingTime(action.text, 450),
  apply(state, action, reveal) {
    const id = action.id ?? `calc${state.seq + 1}`;
    return writeCalcLine({ ...state, seq: state.seq + 1 }, id, action.text, reveal, action.color);
  },
});

export const tagCommand = defineCommand({
  schema: z.object({
    type: z.literal("tag"),
    text: ShortText,
    tone: z.enum(["warn", "ok", "info"]).optional(),
  }),
  doc: '{"type":"tag","text":"Ce qui bloque : …","tone":"warn|ok|info"} : étiquette de diagnostic, affichée en haut de l\'écran.',
  duration: 400,
  quick: true,
  apply(state, action, reveal) {
    return { ...state, tag: { text: action.text, tone: action.tone ?? "warn", reveal } };
  },
});
