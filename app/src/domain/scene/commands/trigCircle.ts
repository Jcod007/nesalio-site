/**
 * Cercle trigonométrique (SN 5) : le modèle donne l'angle ; le moteur trace le
 * cercle de rayon 1, le point P(cos θ, sin θ), l'angle, et les segments dont la
 * LONGUEUR vaut cos θ (sur l'axe des x) et sin θ (vertical, jusqu'à P).
 * Redemander la même figure avec un autre angle la fait évoluer sous les yeux
 * de l'élève (P glisse, les segments suivent, les valeurs se réécrivent).
 */
import { z } from "zod";
import { formatNumber } from "@/domain/board/geometry";
import { worldPerMath } from "@/domain/board/layout";
import { rad } from "@/domain/board/shapes";
import { type BoardNode, type Vec2 } from "@/domain/board/state";
import { ColorName, finite } from "../primitives";
import { axesCommand, base } from "./figure";
import { defineCommand } from "./define";
import { angleMark, drawFigure, label, point, segment, ShapeId } from "./parts";

export const unitCircleCommand = defineCommand({
  schema: z.object({
    type: z.literal("unitCircle"),
    id: ShapeId,
    angle: finite.min(-720).max(720),
    angleLabel: z.string().max(12).optional(),
    values: z.boolean().optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"unitCircle","id":"uc","angle":30,"angleLabel":"θ","values":true} : cercle trigonométrique exact (repère de\n' +
    '  -1,5 à 1,5 tracé s\'il manque), point P(cos θ, sin θ), angle θ, segment cos θ sur l\'axe des x (vert) et sin θ\n' +
    '  vertical jusqu\'à P (orange), angle droit ; "values" écrit cos θ ≈ 0,87 et sin θ = 0,5. Redemande la même figure\n' +
    '  avec un autre "angle" pour la faire tourner (120°, 210°… : les signes changent sous les yeux). Parties : uc-cercle,\n' +
    '  uc-rayon, uc-P, uc-angle, uc-cos, uc-sin.',
  duration: 2200,
  aliases: ["trigCircle", "cercleTrigo"],
  apply(state, action, reveal) {
    let next = state;
    if (!next.axes) next = axesCommand.apply(next, { type: "axes", x: [-1.5, 1.5], y: [-1.5, 1.5], xLabel: "x", yLabel: "y", xStep: 0.5, yStep: 0.5 }, reveal);
    const unit = worldPerMath(next.frame);
    const id = action.id;
    const t = rad(action.angle);
    const c = Math.cos(t);
    const s = Math.sin(t);
    const O: Vec2 = [0, 0];
    const P: Vec2 = [c, s];
    const foot: Vec2 = [c, 0];
    const name = action.angleLabel ?? "θ";
    const parts: BoardNode[] = [
      { ...base(`${id}-cercle`, reveal, "ink"), type: "circle", center: O, radius: 1 },
      segment(`${id}-rayon`, O, P, reveal, action.color ?? "violet"),
      point(`${id}-P`, P, "P", reveal, action.color ?? "violet"),
      // L'angle orienté, de l'axe des x jusqu'à OP (au-delà de 180° aussi : 210° fait plus d'un demi-tour).
      {
        ...base(`${id}-angle`, reveal, "violet"),
        type: "arc",
        center: O,
        radius: Math.min(0.35, 0.5 / unit),
        start: Math.min(0, action.angle),
        end: Math.max(0, action.angle),
        label: name,
      },
    ];
    if (Math.abs(c) > 1e-6) parts.push(segment(`${id}-cos`, O, foot, reveal, "green"));
    if (Math.abs(s) > 1e-6) parts.push(segment(`${id}-sin`, foot, P, reveal, "orange"));
    if (Math.abs(c) > 1e-6 && Math.abs(s) > 1e-6) parts.push(angleMark(next, `${id}-droit`, foot, P, O, undefined, true, reveal));
    if (action.values) {
      const approx = (v: number) => (Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-9 ? "=" : "≈");
      parts.push(label(`${id}-cos-l`, `cos ${name} ${approx(c)} ${formatNumber(Math.round(c * 100) / 100)}`, [c / 2, s >= 0 ? -0.18 / unit - 0.12 : 0.18 / unit + 0.12], `${id}-cercle`, reveal, "green"));
      parts.push(label(`${id}-sin-l`, `sin ${name} ${approx(s)} ${formatNumber(Math.round(s * 100) / 100)}`, [c + (c >= 0 ? 0.55 : -0.55), s / 2], `${id}-cercle`, reveal, "orange"));
    }
    return drawFigure(next, id, parts, reveal, {}, { P, O });
  },
});
