import {
  Axes, Create, FadeIn, MathTex, NumberLine, TransformMatchingTex, VGroup, VMobject, Write, type Animation, type Mobject, type Scene,
} from "manim-web";
import { niceStep } from "@/domain/board/geometry";
import { FONT_SIZE, TICK_FONT } from "@/domain/board/layout";
import { axisNumbers, measureSceneObject, sampleSceneCurve, sceneText, tableLayout, tableRows } from "@/domain/nesalio/measurement";
import type { SceneObject, Slice } from "@/domain/nesalio/contract";
import type { Point } from "@/domain/nesalio/placement";
import { partVisible, symbolValues, type MeasureObject, type Measurement, type PlacedObject } from "@/domain/nesalio/sceneState";
import { DIM_OPACITY, type NesalioFrame } from "@/engine/nesalioPlayback";
import { BRAND } from "@/ui/theme";
import { arrowMark, boardFormula, boardFormulaParts, boardText, circleMark, pointMark, polygonMark, segmentMark } from "./primitives";

const palette = { neutral: BRAND.ink, given: "#2563a6", unknown: "#a55316", accent: BRAND.violet, result: "#18724b", secondary: "#52617b" };
type Vec3 = [number, number, number];
type PartState = { opacity?: number; reveal?: string; animation?: Animation; color?: string };
type Content = {
  key: string; items: Mobject[]; animation?: Animation[]; reveal?: string; color: string; parts?: Map<string, PartState>;
  /** Opacity last applied outside a reveal animation; undefined forces it to be applied again. */
  opacity?: number;
  /** World position the items are drawn at: a `move` shifts them instead of rebuilding them. */
  position: Point;
};
type TextObject = Extract<SceneObject, { type: "text" | "label" | "callout" | "math" | "matrix" }>;

function isText(object: SceneObject): object is TextObject {
  return "content" in object || object.type === "matrix";
}

function fontSize(object: SceneObject): number {
  return FONT_SIZE[object.size === "small" || object.size === "large" ? object.size : "normal"];
}

function dimensions(item: Mobject): Measurement {
  item.getThreeObject();
  const width = Math.max(0.01, item.getWidth()), height = Math.max(0.01, item.getHeight());
  return { body: { x0: -width / 2, y0: -height / 2, x1: width / 2, y1: height / 2 } };
}

/** Manim samples a scene prepared by Nesalio. It does not start a competing animation clock. */
export class NesalioProjection {
  private readonly content = new Map<string, Content>();
  private readonly formulas = new Map<string, { item: Mobject; measurement: Measurement }>();
  private readonly textSizes = new Map<string, Measurement>();
  /** Morphs on screen, by source formula: an animated copy, so neither formula is altered. */
  private readonly morphing = new Map<string, { key: string; group: VGroup; animation: Animation }>();
  constructor(private readonly scene: Scene) {}

  /** World height of a digit at MathTex fontSize 1, measured once: the unit for every formula's font size. */
  private digitHeight?: Promise<number>;

  private measureDigit(): Promise<number> {
    this.digitHeight ??= (async () => {
      const reference = boardFormula("$0$", { fontSize: 1, color: palette.neutral });
      try {
        await reference.waitForRender();
        reference.getThreeObject();
        return reference.getHeight() > 0 ? reference.getHeight() : 0;
      } catch {
        return 0;
      } finally {
        reference.dispose();
      }
    })();
    return this.digitHeight;
  }

  async prepareSlice(slice: Slice, signal: AbortSignal): Promise<void> {
    const digit = await this.measureDigit();
    await Promise.all(slice.introduces.map(async (definition) => {
      if (definition.type !== "math" || typeof definition.content !== "string") return;
      // Same font size for every formula: a digit is as tall as a one-line formula used to be,
      // so a fraction simply grows taller instead of being squeezed into one line's height.
      const target = fontSize(definition) / 80;
      const options = digit > 0 ? { fontSize: target / digit, color: palette.neutral } : { height: target, color: palette.neutral };
      // manim-web lays out the whole formula once, then splits its glyphs between the parts.
      const math = definition.parts
        ? boardFormulaParts(definition.parts.map((part) => part.text), options)
        : boardFormula(`$${definition.content}$`, options);
      await math.waitForRender().catch(() => undefined);
      if (signal.aborted) { math.dispose(); return; }
      const item = math.getRenderError() ? boardText(definition.content, palette.neutral, fontSize(definition)) : math;
      if (item !== math) math.dispose();
      this.formulas.set(definition.id, { item, measurement: dimensions(item) });
    }));
  }

  readonly measure: MeasureObject = (definition, values, math, window) => {
    // A table of values is laid out cell by cell (tableLayout): the drawing follows the same layout.
    if (!isText(definition) || (definition.type === "matrix" && definition.params.row_labels)) return measureSceneObject(definition, values, math, window);
    const formula = this.formulas.get(definition.id);
    if (formula) return formula.measurement;
    const text = definition.type === "matrix" ? definition.params.rows.map((row) => row.join("   ")).join("\n")
      : sceneText(definition, values, math);
    const key = JSON.stringify([fontSize(definition), text]);
    const cached = this.textSizes.get(key);
    if (cached) return cached;
    const item = boardText(text, palette.neutral, fontSize(definition));
    try {
      const measured = dimensions(item);
      if (this.textSizes.size >= 256) this.textSizes.clear();
      this.textSizes.set(key, measured);
      return measured;
    } finally { item.dispose(); }
  };

  draw(frame: NesalioFrame): void {
    const { scene } = frame;
    const values = symbolValues(scene);
    this.drawMorphs(frame, values);
    const parameters = JSON.stringify([...scene.parameters]);
    for (const [id, entry] of this.content) {
      if (!scene.objects.get(id)?.visible) this.remove(id, entry);
    }
    for (const [id, object] of scene.objects) {
      if (!object.visible) continue;
      const { definition, measurement, position, leader } = object;
      const color = palette[frame.highlights.get(id)?.role ?? frame.styles.get(id) ?? definition.style?.role ?? "neutral"];
      const text = "content" in definition ? sceneText(definition, values, scene.math) : undefined;
      const dynamic = definition.type === "function_graph" || definition.type === "parametric_curve" ? parameters : undefined;
      // The shape alone decides a rebuild; the leader is compared relative to the object.
      const relative = leader && [leader.from[0] - position[0], leader.from[1] - position[1], leader.to[0] - position[0], leader.to[1] - position[1]];
      const key = JSON.stringify([measurement.body, relative, text, dynamic]);
      let rendered = this.content.get(id);
      if (rendered?.key !== key) {
        if (rendered) this.remove(id, rendered);
        const items = this.build(object, values, color, text);
        rendered = { key, items, color, position };
        this.content.set(id, rendered);
        this.scene.add(...items);
      } else if (rendered.position[0] !== position[0] || rendered.position[1] !== position[1]) {
        const shift: Vec3 = [position[0] - rendered.position[0], position[1] - rendered.position[1], 0];
        for (const item of rendered.items) item.shift(shift);
        rendered.position = position;
      }
      const reveal = frame.reveals.get(id);
      if (reveal && reveal.progress < 1) {
        if (rendered.reveal !== reveal.key) {
          rendered.reveal = reveal.key;
          rendered.animation = rendered.items.map((item) => {
            const animation = reveal.verb === "draw" ? new Create(item)
              : reveal.verb === "write" && item instanceof MathTex ? new Write(item) : new FadeIn(item);
            animation.begin();
            return animation;
          });
        }
        for (const animation of rendered.animation ?? []) animation.interpolate(reveal.progress);
      } else if (rendered.animation) {
        for (const animation of rendered.animation) animation.finish();
        rendered.animation = undefined;
        rendered.opacity = undefined;
      }
      // Dimmed, fading out, or coming back from dim. A formula written by parts sets its glyphs itself.
      const opacity = frame.opacity.get(id) ?? (object.dimmed ? DIM_OPACITY : 1);
      const byParts = definition.type === "math" && definition.parts !== undefined && rendered.items[0] instanceof MathTex
        && rendered.items[0].getPartCount() === definition.parts.length;
      if (!rendered.animation && rendered.opacity !== opacity) {
        rendered.items.forEach((item, index) => { if (!(byParts && index === 0)) item.opacity = opacity; });
        rendered.opacity = opacity;
      }
      if (rendered.color !== color) {
        for (const item of rendered.items) item.setColor(color);
        rendered.color = color;
        // The whole formula was recoloured: every part takes its own colour again below.
        for (const state of rendered.parts?.values() ?? []) state.color = color;
      }
      if (byParts) this.drawParts(object, rendered, color, opacity, frame.partReveals.get(id), frame.partHighlights.get(id));
    }
  }

  /**
   * `transform`: glyphs common to both formulas slide to their new place, the
   * others fade (manim's TransformMatchingTex). It runs on copies, created
   * before the source is hidden, and leaves when the target takes over.
   */
  private drawMorphs(frame: NesalioFrame, values: ReadonlyMap<string, number>): void {
    for (const [source, morph] of this.morphing) {
      if (frame.morphs.get(source)?.key === morph.key) continue;
      morph.animation.finish();
      this.scene.remove(morph.group);
      morph.group.dispose();
      this.morphing.delete(source);
    }
    for (const [source, { key, target, progress }] of frame.morphs) {
      let morph = this.morphing.get(source);
      if (!morph) {
        const from = this.content.get(source)?.items[0];
        const goal = frame.scene.objects.get(target);
        if (!(from instanceof VMobject) || !goal) continue;
        const role = frame.styles.get(target) ?? goal.definition.style?.role ?? "neutral";
        const text = "content" in goal.definition ? sceneText(goal.definition, values, frame.scene.math) : undefined;
        const to = this.build(goal, values, palette[role], text)[0];
        if (!(to instanceof VMobject)) continue;
        const copy = from.copy();
        copy.opacity = 1;
        const group = new VGroup(copy);
        this.scene.add(group);
        const animation = new TransformMatchingTex(copy, to, { transformMismatches: true });
        animation.begin();
        morph = { key, group, animation };
        this.morphing.set(source, morph);
      }
      morph.animation.interpolate(progress);
    }
  }

  /** Unwritten parts keep their place in the layout but stay invisible. */
  private drawParts(
    object: PlacedObject, rendered: Content, color: string, opacity: number,
    writes?: ReadonlyMap<string, { key: string; progress: number }>,
    highlights?: ReadonlyMap<string, { role: keyof typeof palette; progress: number }>,
  ): void {
    const formula = rendered.items[0];
    const parts = object.definition.type === "math" ? object.definition.parts ?? [] : [];
    // A formula that fell back to plain text cannot be split: it is shown whole.
    if (!(formula instanceof MathTex) || formula.getPartCount() !== parts.length) return;
    const states = rendered.parts ??= new Map();
    parts.forEach((part, index) => {
      const glyphs = formula.getPart(index);
      // A fresh state (first draw, or a rebuilt entry) always applies the opacity once.
      const state = states.get(part.id) ?? {};
      states.set(part.id, state);
      const visible = partVisible(object, part.id);
      if (!visible && state.animation) {
        state.animation.finish();
        state.animation = state.reveal = undefined;
      }
      const wanted = visible ? opacity : 0;
      if (state.opacity !== wanted && !state.animation) {
        glyphs.opacity = wanted;
        state.opacity = wanted;
      }
      if (!visible) return;
      // Only this part takes the highlight colour; the rest of the formula keeps its own.
      const highlight = highlights?.get(part.id);
      const partColor = highlight ? palette[highlight.role] : color;
      if (state.color !== partColor) {
        glyphs.setColor(partColor);
        state.color = partColor;
      }
      const write = writes?.get(part.id);
      if (write && write.progress < 1) {
        if (state.reveal !== write.key) {
          state.animation?.finish();
          state.reveal = write.key;
          state.animation = new Write(glyphs);
          state.animation.begin();
        }
        state.animation?.interpolate(write.progress);
      } else if (state.animation) {
        state.animation.finish();
        state.animation = undefined;
        // Write ends fully opaque: the part takes the formula's opacity again on the next frame.
        state.opacity = undefined;
      }
    });
  }

  private build(object: PlacedObject, values: ReadonlyMap<string, number>, color: string, text?: string): Mobject[] {
    const { definition: def, position: [dx, dy], measurement, leader } = object;
    const world = ([x, y]: Point): Vec3 => [x + dx, y + dy, 0];
    const stroke = { color, strokeWidth: 3 };
    const items: Mobject[] = [];
    switch (def.type) {
      case "point": items.push(...pointMark(world(def.params.at), color)); break;
      case "line": items.push(segmentMark(world(def.params.from), world(def.params.to), color)); break;
      case "arrow":
      case "vector": items.push(arrowMark(world(def.params.from), world(def.params.to), color)); break;
      case "circle": items.push(circleMark(world(def.params.center), def.params.radius, color)); break;
      case "polygon": items.push(polygonMark({ ...stroke, vertices: def.params.vertices.map(world) })); break;
      case "triangle_right": {
        const { x1, y1 } = measurement.body;
        items.push(polygonMark({ ...stroke, vertices: [world([0, 0]), world([x1, 0]), world([0, y1])] }));
        break;
      }
      case "function_graph":
      case "parametric_curve":
        for (const piece of sampleSceneCurve(def, values, object.window)) {
          // A curve is a line: without an explicit 0, manim-web fills the area under the open path.
          items.push(new VMobject().setColor(color).setStrokeWidth(3).setFillOpacity(0).setPointsAsCorners(piece.map(world)));
        }
        break;
      case "number_line": {
        const [a, b] = def.params.domain;
        const line = new NumberLine({ ...stroke, xRange: [a, b, niceStep(b - a)], length: b - a });
        const at = line.numberToPoint(a);
        line.shift([a + dx - at[0], dy - at[1], 0]);
        items.push(line);
        break;
      }
      case "axes": {
        const { x: [x0, x1], y: [y0, y1] } = def.params ?? { x: [-6, 6], y: [-4, 4] };
        const axes = new Axes({ color, xRange: [x0, x1, niceStep(x1 - x0)], yRange: [y0, y1, niceStep(y1 - y0)], xLength: x1 - x0, yLength: y1 - y0 });
        const at = axes.coordsToPoint(0, 0);
        axes.shift([dx - at[0], dy - at[1], 0]);
        items.push(axes);
        // Numbered ticks: without them a point on a curve cannot be read (seen in real generations).
        for (const number of axisNumbers(def.params)) {
          const label = boardText(number.text, BRAND.muted, TICK_FONT, "body");
          label.moveTo([dx + number.at[0], dy + number.at[1], 0]);
          items.push(label);
        }
        break;
      }
      case "matrix":
        if (def.params.row_labels) {
          const layout = tableLayout(tableRows(def.params), fontSize(def));
          for (const [from, to] of layout.lines) items.push(segmentMark([dx + from[0], dy + from[1], 0], [dx + to[0], dy + to[1], 0], palette.secondary, false, 2));
          for (const cell of layout.cells) {
            const text = boardText(cell.text, color, fontSize(def));
            text.moveTo([dx + cell.at[0], dy + cell.at[1], 0]);
            items.push(text);
          }
          break;
        }
      // falls through: a matrix without row titles is written as text
      default: {
        const formula = this.formulas.get(def.id);
        const textContent = def.type === "matrix" ? def.params.rows.map((row) => row.join("   ")).join("\n") : text ?? "";
        const item = formula?.item ?? boardText(textContent, color, fontSize(def));
        item.setColor(color);
        item.moveTo([dx, dy, 0]);
        items.push(item);
      }
    }
    if (leader) items.push(segmentMark([...leader.from, 0], [...leader.to, 0], color, false, 1.5));
    return items;
  }

  private remove(id: string, entry: Content): void {
    for (const animation of entry.animation ?? []) animation.finish();
    this.scene.remove(...entry.items);
    for (const item of entry.items) if (item !== this.formulas.get(id)?.item) item.dispose();
    this.content.delete(id);
  }

  dispose(): void {
    for (const { group } of this.morphing.values()) { this.scene.remove(group); group.dispose(); }
    this.morphing.clear();
    for (const [id, entry] of this.content) this.remove(id, entry);
    for (const { item } of this.formulas.values()) item.dispose();
    this.formulas.clear();
  }
}
