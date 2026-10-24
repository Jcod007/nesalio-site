/**
 * L'image de la vidéo, 1080 × 1920 : le tableau (canevas WebGL de manim-web)
 * recopié au centre, et par-dessus ce que TikTok attend d'une bonne vidéo :
 * l'accroche en grand dès la première image, le texte de chaque plan, la
 * marque discrète, et la carte de fin.
 *
 * Tout est dessiné sur un seul canevas : c'est lui qui est enregistré pour
 * l'export, l'aperçu et la vidéo finale sont donc la même image.
 *
 * Zones sûres de TikTok : rien d'important dans les ~200 px du haut, les
 * ~480 px du bas et les ~130 px de droite (boutons et légende de l'appli).
 */
import type { StudioScript } from "@/domain/studio/script";
import { shotAt, type Timeline } from "@/domain/studio/timeline";
import { BRAND } from "@/ui/theme";

export const VIDEO_W = 1080;
export const VIDEO_H = 1920;
/** Taille du tableau en pixels CSS (densité 2 → 1080 × 1920). */
export const STAGE_W = 540;
export const STAGE_H = 960;

/** Marges du tableau (pixels CSS du tableau) : la figure se cadre entre l'accroche et le texte. */
export const BOARD_INSETS = { top: 245, right: 62, bottom: 282, left: 14 };

const DISPLAY = '"Bricolage Grotesque Variable", system-ui, sans-serif';
const BODY = '"Atkinson Hyperlegible", system-ui, sans-serif';

const HOOK_Y = 345;
const TITLE_Y = 290;
const CAPTION_Y = 1440;
const BRAND_Y = 186;

export interface FrameInput {
  board: CanvasImageSource | null;
  script: StudioScript;
  timeline: Timeline;
  /** Temps vidéo en ms, ou `null` à l'arrêt (on montre alors la première image). */
  t: number | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
/** Petit rebond à l'arrivée. */
const easeBack = (x: number) => {
  const c = 1.6;
  const p = clamp01(x) - 1;
  return 1 + (c + 1) * p ** 3 + c * p ** 2;
};

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/\s+\S*$/, "")}…`;
    return kept;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function paper(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = BRAND.paper;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  ctx.strokeStyle = BRAND.grid;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 28; x < VIDEO_W; x += 56) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIDEO_H);
  }
  for (let y = 28; y < VIDEO_H; y += 56) {
    ctx.moveTo(0, y);
    ctx.lineTo(VIDEO_W, y);
  }
  ctx.stroke();
}

/** La mascotte de Nesalio : un cube violet arrondi, deux yeux. */
export function drawMascot(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, blink = false) {
  ctx.save();
  ctx.fillStyle = BRAND.violet;
  roundRect(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.28);
  ctx.fill();
  ctx.fillStyle = "#fff";
  const eyeY = cy - size * 0.06;
  for (const dx of [-0.17, 0.17]) {
    ctx.beginPath();
    if (blink) ctx.ellipse(cx + dx * size, eyeY, size * 0.07, size * 0.018, 0, 0, Math.PI * 2);
    else ctx.ellipse(cx + dx * size, eyeY, size * 0.065, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function brand(ctx: CanvasRenderingContext2D, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  drawMascot(ctx, 84, BRAND_Y, 44);
  ctx.fillStyle = BRAND.ink;
  ctx.font = `700 34px ${DISPLAY}`;
  ctx.textBaseline = "middle";
  ctx.fillText("nesalio", 120, BRAND_Y + 1);
  ctx.restore();
}

function hookCard(ctx: CanvasRenderingContext2D, text: string, progress: number, leaving: number) {
  const appear = easeBack(progress / 0.35);
  const alpha = clamp01(progress / 0.15) * (1 - clamp01(leaving));
  if (alpha <= 0) return;
  ctx.save();
  ctx.font = `800 76px ${DISPLAY}`;
  const lines = wrapLines(ctx, text, 860, 3);
  const lineH = 88;
  const h = lines.length * lineH + 56;
  const w = Math.min(960, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 88);
  ctx.globalAlpha = alpha;
  ctx.translate(VIDEO_W / 2, HOOK_Y);
  const scale = 0.82 + 0.18 * appear - 0.08 * clamp01(leaving);
  ctx.scale(scale, scale);
  ctx.rotate(-0.02);
  ctx.fillStyle = BRAND.violet;
  ctx.shadowColor = "rgba(24,34,58,0.25)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, -w / 2, -h / 2, w, h, 36);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => ctx.fillText(line, 0, -h / 2 + 28 + lineH * (i + 0.5)));
  ctx.restore();
}

function titleStrip(ctx: CanvasRenderingContext2D, text: string, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `800 46px ${DISPLAY}`;
  const [line] = wrapLines(ctx, text, 900, 1);
  ctx.fillStyle = BRAND.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(line ?? "", VIDEO_W / 2, TITLE_Y);
  const w = Math.min(900, ctx.measureText(line ?? "").width);
  ctx.fillStyle = BRAND.violet;
  roundRect(ctx, VIDEO_W / 2 - w / 2, TITLE_Y + 34, w, 8, 4);
  ctx.fill();
  ctx.restore();
}

function caption(ctx: CanvasRenderingContext2D, text: string, sinceStart: number, untilEnd: number) {
  if (!text) return;
  const appear = easeOut(sinceStart / 260);
  const alpha = appear * clamp01(untilEnd / 180);
  if (alpha <= 0) return;
  ctx.save();
  ctx.font = `700 54px ${BODY}`;
  const lines = wrapLines(ctx, text, 860, 3);
  const lineH = 66;
  const h = lines.length * lineH + 40;
  const w = Math.min(960, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 72);
  ctx.globalAlpha = alpha;
  ctx.translate(VIDEO_W / 2, CAPTION_Y + (1 - appear) * 30);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = BRAND.ink;
  ctx.lineWidth = 5;
  roundRect(ctx, -w / 2, -h / 2, w, h, 28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = BRAND.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => ctx.fillText(line, 0, -h / 2 + 20 + lineH * (i + 0.5)));
  ctx.restore();
}

function endCard(ctx: CanvasRenderingContext2D, cta: string, since: number) {
  const fade = easeOut(since / 350);
  ctx.save();
  ctx.globalAlpha = 0.93 * fade;
  ctx.fillStyle = BRAND.paper;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  ctx.globalAlpha = fade;
  const bounce = easeBack((since - 120) / 450);
  drawMascot(ctx, VIDEO_W / 2, 700 - (1 - bounce) * 60, 230 * (0.7 + 0.3 * bounce), since % 2600 > 2450);
  ctx.fillStyle = BRAND.ink;
  ctx.font = `800 60px ${DISPLAY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapLines(ctx, cta, 900, 3).forEach((line, i) => ctx.fillText(line, VIDEO_W / 2, 960 + i * 72));
  ctx.fillStyle = BRAND.violet;
  ctx.font = `800 84px ${DISPLAY}`;
  ctx.globalAlpha = easeOut((since - 300) / 400);
  ctx.fillText("nesalio.com", VIDEO_W / 2, 1210);
  ctx.restore();
}

/** Dessine l'image de la vidéo au temps `input.t`. */
export function drawFrame(ctx: CanvasRenderingContext2D, input: FrameInput): void {
  const { script, timeline } = input;
  const t = input.t;
  paper(ctx);
  if (input.board) ctx.drawImage(input.board, 0, 0, VIDEO_W, VIDEO_H);

  // À l'arrêt : l'image d'accueil de la vidéo (accroche et titre), comme une miniature.
  if (t === null) {
    brand(ctx, 1);
    hookCard(ctx, script.hook, 1, 0);
    return;
  }

  if (t >= timeline.outro.startMs) {
    endCard(ctx, script.cta, t - timeline.outro.startMs);
    return;
  }

  brand(ctx, 1);
  const hookLeave = (t - timeline.hookUntilMs) / 250;
  hookCard(ctx, script.hook, t / 400, hookLeave);
  titleStrip(ctx, script.title, clamp01(hookLeave - 0.6));

  const shot = shotAt(timeline, t);
  if (shot) caption(ctx, shot.text, t - shot.startMs, shot.startMs + shot.durationMs - t);
}
