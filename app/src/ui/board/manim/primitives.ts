import { Arrow, Circle, DashedLine, DashedVMobject, Dot, Line, MathTex, Polygon, Text, setMathJaxScriptUrl, type MathTexOptions, type PolygonOptions } from "manim-web";
import { toLatex } from "@/domain/board/tex";
import { BRAND } from "@/ui/theme";
import { CHEM_MACROS, expandChemistry } from "./chemistry";
import { drawableMathLetters } from "./mathLetters";

// Formulas use manim-web's bundled MathJax. If it fails to load, manim-web would fetch a full
// MathJax from a public CDN: the formula falls back to plain text instead. Throws once loading started.
try { setMathJaxScriptUrl(null); } catch { /* already loading: the setting can no longer change */ }

export type WorldPoint = [number, number, number];

export function pointMark(center: WorldPoint, color: string, open = false) {
  const radius = 0.085;
  if (!open) return [new Dot({ point: center, radius, color })];
  // The background disc covers the line endpoint behind the open marker.
  return [
    new Dot({ point: center, radius, color: BRAND.paper }),
    new Circle({ center, radius, color, strokeWidth: 3.5 }),
  ];
}

export function segmentMark(start: WorldPoint, end: WorldPoint, color: string, dashed = false, strokeWidth = dashed ? 3 : 3.5) {
  const options = { start, end, color, strokeWidth };
  return dashed ? new DashedLine({ ...options, dashLength: 0.12 }) : new Line(options);
}

export function arrowMark(start: WorldPoint, end: WorldPoint, color: string) {
  return new Arrow({ start, end, color, strokeWidth: 5, tipLength: 0.22, tipWidth: 0.2 });
}

export function circleMark(center: WorldPoint, radius: number, color: string, dashed = false, ellipse?: WorldPoint[]) {
  // Build dashes at the origin before shifting the result into world space.
  const shape = ellipse ? new Polygon({ vertices: ellipse, color, strokeWidth: 3.5, closed: true })
    : new Circle({ radius, color, strokeWidth: 3.5 });
  const mark = dashed ? new DashedVMobject({ vmobject: shape, numDashes: Math.max(16, Math.round(radius * 12)), dashRatio: 0.55 }) : shape;
  mark.shift(center);
  return mark;
}

export function polygonMark(options: PolygonOptions, dashed = false) {
  const shape = new Polygon(options);
  return dashed
    ? new DashedVMobject({ vmobject: shape, numDashes: Math.max(12, options.vertices.length * 6), dashRatio: 0.55 })
    : shape;
}

export function boardText(text: string, color: string, fontSize: number, font: "hand" | "body" = "hand") {
  return new Text({
    text, color, fontSize,
    fontFamily: font === "hand" ? "Caveat" : "Atkinson Hyperlegible, sans-serif",
    // 700 since 2026-11-09 (600 before): next to the thick ink of the formulas, the handwritten notes looked faint.
    fontWeight: font === "hand" ? 700 : 400,
  });
}

/** Chemistry (`\ce{…}`) is converted to base LaTeX first: manim-web's MathJax has no mhchem. */
export function boardFormula(text: string, options: Omit<MathTexOptions, "latex">) {
  return new MathTex({ latex: drawableMathLetters(expandChemistry(toLatex(text))), ...options, macros: { ...CHEM_MACROS, ...options.macros } });
}

/** One layout for the whole formula, split into parts. A trailing space keeps `\alpha` + `b` from fusing. */
export function boardFormulaParts(parts: readonly string[], options: Omit<MathTexOptions, "latex">) {
  return new MathTex({
    latex: parts.map((part) => `${drawableMathLetters(expandChemistry(toLatex(`$${part}$`)))} `), ...options, macros: { ...CHEM_MACROS, ...options.macros },
  });
}
