/**
 * Audit de la caméra : joue chaque leçon enregistrée comme le lecteur (même moteur, même caméra),
 * avec une voix simulée (durée d'après les mots, repères placés d'après leur position dans la phrase),
 * et regarde chaque image (toutes les 200 ms) :
 *   - objet coupé : visible, à moitié dans le cadre ;
 *   - geste hors champ : un objet qu'on vient de montrer, d'écrire ou de surligner est entièrement hors du cadre ;
 *   - écran vide : des objets sont au tableau mais aucun n'est dans le cadre ;
 *   - trop petit : la caméra recule sous le zoom lisible (0,6), le texte devient petit.
 * Mesures du texte : estimations du moteur (sans les vraies polices du navigateur). Gratuit, aucun appel.
 *
 * Ignoré par la suite normale ; dans app/ :
 *   CAMERA=1 npx vitest run tools/eval/camera-banc.test.mjs
 * Variables : DOSSIERS (dossiers d'analyses/banc séparés par des virgules ; défaut : bancs récents + leçons jouées).
 * Écrit analyses/camera/rapport.md et rapport.json.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cueOffset } from "@/domain/nesalio/alignment";
import { cameraView, sceneBounds } from "@/domain/nesalio/sceneState";
import { validateLesson } from "@/domain/nesalio/validate";
import { playNesalioLesson } from "@/engine/nesalioPlayback";

const ROOT = join(process.cwd(), "..", "analyses");
const DEFAULT_DIRS = ["banc/ap2-allegees", "banc/ap3-relecteur", "banc/ap3n-sans", "banc/ap3n-relecteur", "banc/coupees-apres", "banc/coupees-apres-nouvelles", "lecons-jouees"];
const STEP_MS = 200;
/** Voice at speed 0.75: about 115 words a minute. */
const WORDS_PER_MINUTE = 115;
const READABLE_ZOOM = 0.6;
/** A gesture is « on screen » when its object can be seen within this long after it. */
const GESTURE_MS = 1_500;

function lessonFiles() {
  const dirs = process.env.DOSSIERS?.split(",").map((d) => d.trim()).filter(Boolean) ?? DEFAULT_DIRS;
  return dirs.flatMap((dir) => {
    const full = join(ROOT, dir);
    if (!existsSync(full)) return [];
    return readdirSync(full).filter((f) => f.endsWith(".json") && !f.startsWith("rapport")).map((f) => ({ dir, file: f, path: join(full, f) }));
  });
}

/** A lesson file as the banc writes it, or as the page keeps it (header + slices). */
function lessonOf(raw) {
  if (raw.scene) return raw;
  return null;
}

function clipFor(beat) {
  const words = beat.say.split(/\s+/).filter(Boolean).length;
  const durationMs = Math.max(1_000, (words / WORDS_PER_MINUTE) * 60_000);
  const cues = new Map();
  for (const cue of beat.cues) {
    const start = cueOffset(beat.say, cue.text, cue.occurrence ?? 1);
    if (start < 0) continue;
    const end = start + cue.text.length;
    cues.set(cue.id, { start: (start / beat.say.length) * durationMs, end: (end / beat.say.length) * durationMs });
  }
  return {
    durationMs, cues, dispose() {},
    async play(draw) { for (let t = 0; t <= durationMs; t += STEP_MS) draw(t); draw(durationMs); },
  };
}

const inside = (box, view) => box.x0 >= view.x0 - 1e-3 && box.x1 <= view.x1 + 1e-3 && box.y0 >= view.y0 - 1e-3 && box.y1 <= view.y1 + 1e-3;
const touches = (box, view) => box.x1 > view.x0 && box.x0 < view.x1 && box.y1 > view.y0 && box.y0 < view.y1;

async function audit(lesson) {
  const issues = { cutMs: 0, emptyMs: 0, smallMs: 0, offscreen: [], cut: new Set(), emptyAt: [], minZoom: Infinity, frames: 0, durationMs: 0 };
  /** Object id → time of its last gesture (show, write, draw, highlight, transform). */
  const recent = new Map();
  /** Gestures under way in the previous frame. */
  const active = new Set();
  let clock = 0;
  await playNesalioLesson(lesson, {
    viewport: { x0: -8, y0: -4.5, x1: 8, y1: 4.5 }, signal: new AbortController().signal, wait: async () => {},
    openClip: async (beat) => clipFor(beat),
    onFrame: (frame) => {
      const { scene } = frame;
      issues.frames++;
      clock += STEP_MS;
      // While the camera travels, an object half in the frame is expected: only a still camera is judged.
      const moving = scene.camera.is_animating;
      const view = cameraView(scene, scene.camera.state);
      issues.minZoom = Math.min(issues.minZoom, scene.camera.state.zoom);
      // The start of each gesture (a reveal, highlight or morph seen for the first time).
      for (const id of [...frame.reveals.keys(), ...frame.highlights.keys(), ...[...frame.morphs.values()].map((m) => m.target)]) {
        if (!active.has(id)) recent.set(id, clock);
      }
      active.clear();
      for (const id of [...frame.reveals.keys(), ...frame.highlights.keys(), ...[...frame.morphs.values()].map((m) => m.target)]) active.add(id);
      const shown = [...scene.objects].filter(([, o]) => o.visible && !o.removed && !o.faded && (frame.opacity.get(o.definition.id) ?? 1) > 0.05);
      let anyInView = false, cut = false;
      for (const [id] of shown) {
        const box = sceneBounds(scene, [id], "render_bounds");
        if (!box) continue;
        if (touches(box, view)) anyInView = true;
        if (moving) continue;
        if (touches(box, view) && !inside(box, view)) { cut = true; issues.cut.add(id); }
        // Still out of frame GESTURE_MS after the gesture began: the student does not see it happen.
        const at = recent.get(id);
        if (at !== undefined && clock - at >= GESTURE_MS && clock - at < GESTURE_MS + STEP_MS && !touches(box, view) && !issues.offscreen.includes(id)) issues.offscreen.push(id);
      }
      issues.cutMs += cut && !moving ? STEP_MS : 0;
      if (shown.length && !anyInView && !moving) {
        issues.emptyMs += STEP_MS;
        const where = `${scene.currentSlice}/${scene.currentBeat}`;
        if (!issues.emptyAt.includes(where)) issues.emptyAt.push(where);
      }
      issues.smallMs += scene.camera.state.zoom < READABLE_ZOOM - 1e-6 ? STEP_MS : 0;
    },
    onWarning: () => {},
  });
  issues.durationMs = issues.frames * STEP_MS;
  return issues;
}

describe.runIf(process.env.CAMERA === "1")("audit de la caméra sur les leçons enregistrées", () => {
  it("joue chaque leçon et écrit le rapport", { timeout: 3_600_000 }, async () => {
    const rows = [];
    // The clock of the frames: each frame of the simulated clip is STEP_MS later.
    for (const { dir, file, path } of lessonFiles()) {
      const lesson = lessonOf(JSON.parse(readFileSync(path, "utf8")));
      if (!lesson || !lesson.slices?.length) continue;
      const valid = validateLesson(lesson);
      if (!valid.ok) { rows.push({ dir, file, invalid: valid.issues[0]?.message }); continue; }
      try {
        const r = await audit(valid.value);
        rows.push({ dir, file, seconds: Math.round(r.durationMs / 1000), cutS: r.cutMs / 1000, emptyS: r.emptyMs / 1000, smallS: r.smallMs / 1000,
          minZoom: +r.minZoom.toFixed(2), cut: [...r.cut], offscreen: r.offscreen, emptyAt: r.emptyAt });
      } catch (error) { rows.push({ dir, file, error: String(error) }); }
    }
    const played = rows.filter((r) => r.seconds !== undefined);
    const share = (pred) => `${played.filter(pred).length}/${played.length}`;
    const lines = [
      "# Audit de la caméra (leçons enregistrées, voix simulée)", "",
      `Leçons jouées : ${played.length} ; invalides ou en erreur : ${rows.length - played.length}.`, "",
      "| Défaut | Leçons touchées | Durée totale |", "| --- | --- | --- |",
      `| Objet coupé par le bord du cadre | ${share((r) => r.cutS > 0)} | ${played.reduce((s, r) => s + r.cutS, 0).toFixed(0)} s |`,
      `| Geste sur un objet hors champ | ${share((r) => r.offscreen.length > 0)} | — |`,
      `| Écran vide alors que le tableau ne l'est pas | ${share((r) => r.emptyS > 0)} | ${played.reduce((s, r) => s + r.emptyS, 0).toFixed(0)} s |`,
      `| Caméra sous le zoom lisible (0,6) | ${share((r) => r.smallS > 0)} | ${played.reduce((s, r) => s + r.smallS, 0).toFixed(0)} s |`,
      "", "## Les leçons les plus touchées", "",
      "| Leçon | Durée | Coupé | Hors champ | Vide | Trop petit | Zoom min |", "| --- | --- | --- | --- | --- | --- | --- |",
      ...played.map((r) => ({ ...r, score: r.cutS + r.emptyS * 3 + r.smallS + r.offscreen.length * 5 }))
        .sort((a, b) => b.score - a.score).slice(0, 30)
        .map((r) => `| ${r.dir}/${r.file} | ${r.seconds} s | ${r.cutS} s (${r.cut.slice(0, 4).join(", ")}) | ${r.offscreen.join(", ") || "—"} | ${r.emptyS} s | ${r.smallS} s | ${r.minZoom} |`),
      "", "## Invalides ou en erreur", "", ...rows.filter((r) => r.seconds === undefined).map((r) => `- ${r.dir}/${r.file} : ${r.invalid ?? r.error}`),
    ];
    const out = join(ROOT, "camera");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "rapport.md"), lines.join("\n"));
    writeFileSync(join(out, "rapport.json"), JSON.stringify(rows, null, 1));
    expect(played.length).toBeGreaterThan(0);
  });
});
