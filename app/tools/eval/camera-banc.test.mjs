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
const STEP_MS = 100;
/** Screen width in world units at zoom 1 (viewport 16 × 9). */
const SCREEN = 16;
/** Voice at speed 0.75: about 115 words a minute. */
const WORDS_PER_MINUTE = 115;
const READABLE_ZOOM = 0.6;
/** A gesture is « on screen » when its object can be seen within this long after it. */
const GESTURE_MS = 1_500;
/**
 * Composition (référence 3Blue1Brown : le sujet remplit l'image et en occupe le centre). Sur une image immobile,
 * le contenu visible remplit l'écran quand il en occupe au moins SPARSE de la largeur ou de la hauteur ;
 * il est décentré quand le centre de ce qui est montré s'écarte de plus de OFF_CENTER écran du centre.
 */
const SPARSE = 0.45;
const OFF_CENTER = 0.2;

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
  const issues = { stillMs: 0, coverageSum: 0, sparseMs: 0, offCenterMs: 0, cutMs: 0, emptyMs: 0, smallMs: 0, offscreen: [], cut: new Set(), emptyAt: [], minZoom: Infinity, frames: 0, durationMs: 0, moves: [] };
  /** Object id → time of its last gesture (show, write, draw, highlight, transform). */
  const recent = new Map();
  /** Gestures under way in the previous frame. */
  const active = new Set();
  let clock = 0;
  /** Origin of the last camera plan (who framed the picture now on screen): lesson, follow, start. */
  let framedBy = "depart";
  issues.sparseBy = {};
  issues.offBy = {};
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
        // An object in the middle of a fade (leaving, or stepping back) may slip past the edge as the camera moves on.
        const fading = frame.opacity.has(id) && !scene.objects.get(id)?.dimmed;
        if (touches(box, view) && !inside(box, view) && !fading) { cut = true; issues.cut.add(id); }
        // Still out of frame GESTURE_MS after the gesture began: the student does not see it happen.
        const at = recent.get(id);
        if (at !== undefined && clock - at >= GESTURE_MS && clock - at < GESTURE_MS + STEP_MS && !touches(box, view) && !issues.offscreen.includes(id)) issues.offscreen.push(id);
      }
      issues.cutMs += cut && !moving ? STEP_MS : 0;
      if (!moving && anyInView) {
        const boxes = shown.map(([id]) => sceneBounds(scene, [id], "render_bounds")).filter((b) => b && touches(b, view))
          .map((b) => ({ x0: Math.max(b.x0, view.x0), x1: Math.min(b.x1, view.x1), y0: Math.max(b.y0, view.y0), y1: Math.min(b.y1, view.y1) }));
        const c = boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) }));
        const W = view.x1 - view.x0, H = view.y1 - view.y0;
        const coverage = Math.max((c.x1 - c.x0) / W, (c.y1 - c.y0) / H);
        const offset = Math.max(Math.abs((c.x0 + c.x1) / 2 - (view.x0 + view.x1) / 2) / W, Math.abs((c.y0 + c.y1) / 2 - (view.y0 + view.y1) / 2) / H);
        issues.stillMs += STEP_MS;
        issues.coverageSum += coverage * STEP_MS;
        // A small subject at the text's design size is fine (a short equation alone, as in 3Blue1Brown):
        // too empty means the camera stepped back while there was little to show.
        if (coverage < SPARSE && scene.camera.state.zoom < 1 - 1e-6) { issues.sparseMs += STEP_MS; issues.sparseBy[framedBy] = (issues.sparseBy[framedBy] ?? 0) + STEP_MS; }
        if (offset > OFF_CENTER) { issues.offCenterMs += STEP_MS; issues.offBy[framedBy] = (issues.offBy[framedBy] ?? 0) + STEP_MS; }
      }
      if (shown.length && !anyInView && !moving) {
        issues.emptyMs += STEP_MS;
        const where = `${scene.currentSlice}/${scene.currentBeat}`;
        if (!issues.emptyAt.includes(where)) issues.emptyAt.push(where);
      }
      issues.smallMs += scene.camera.state.zoom < READABLE_ZOOM - 1e-6 ? STEP_MS : 0;
    },
    onWarning: () => {},
    onCameraPlan: (plan) => { issues.moves.push({ ...plan, at: clock }); framedBy = plan.origin === "lesson" ? `json_${plan.action.startsWith("restore") ? "restore" : "focus"}` : plan.origin; },
  });
  issues.durationMs = issues.frames * STEP_MS;
  return issues;
}

/**
 * Comfort of the camera (« ne pas donner la nausée »), per minute of lesson. Each movement costs 1, plus its
 * travel (2 per screen width), its zoom change (2 per factor e), 3 if faster than one screen a second, 3 if it
 * jumps in no time; a movement that comes back against the previous one within 4 s costs 3 more.
 * Readability: 0.1 per second of a cut object, 0.3 per second of empty screen, 2 per gesture out of frame.
 * Lower is better.
 */
export function comfort(r) {
  const minutes = Math.max(0.25, r.durationMs / 60_000);
  let motion = 0, back = 0, jumps = 0, fast = 0, travel = 0;
  let previous;
  const lessonMoves = [];
  for (const m of r.moves) {
    const width = SCREEN / m.from.zoom;
    const dx = (m.to.x - m.from.x) / width, dy = (m.to.y - m.from.y) / width;
    const distance = Math.hypot(dx, dy), zoom = Math.abs(Math.log(m.to.zoom / m.from.zoom));
    if (distance < 0.02 && zoom < 0.03) continue;
    const seconds = m.durationMs / 1000;
    const isJump = seconds < 0.05;
    const isFast = !isJump && (distance + zoom) / seconds > 1;
    motion += 1 + 2 * distance + 2 * zoom + (isFast ? 3 : 0) + (isJump ? 3 : 0);
    travel += distance;
    jumps += isJump ? 1 : 0;
    fast += isFast ? 1 : 0;
    if (previous && m.at - previous.at < 4_000 && dx * previous.dx + dy * previous.dy < 0) { back++; motion += 3; }
    previous = { dx, dy, at: m.at };
    if (m.origin === "lesson") {
      lessonMoves.push({ distance: +distance.toFixed(2), zoom: +(m.to.zoom / m.from.zoom).toFixed(2) });
    }
  }
  const moves = r.moves.filter((m) => Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y) / (SCREEN / m.from.zoom) >= 0.02 || Math.abs(Math.log(m.to.zoom / m.from.zoom)) >= 0.03);
  const readability = 0.1 * r.cutMs / 1000 + 0.3 * r.emptyMs / 1000 + 2 * r.offscreen.length;
  return {
    score: +((motion + readability) / minutes).toFixed(2), motion: +(motion / minutes).toFixed(2), readability: +(readability / minutes).toFixed(2),
    movesPerMin: +(moves.length / minutes).toFixed(2), travelPerMin: +(travel / minutes).toFixed(2), back, jumps, fast,
    lessonMoves,
    kinds: Object.fromEntries(["anticipe_", "suivi_", "plage_"].map((k) => [k, r.moves.filter((m) => m.origin !== "lesson" && (k === "suivi_" ? !m.action.startsWith("anticipe_") : m.action.startsWith(k))).length])),
    byOrigin: Object.fromEntries(["lesson", "follow", "range"].map((o) => [o, moves.filter((m) => m.origin === o).length])),
  };
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
          minZoom: +r.minZoom.toFixed(2), cut: [...r.cut],
          stillS: r.stillMs / 1000, coverage: +(r.coverageSum / Math.max(1, r.stillMs)).toFixed(3), sparseS: r.sparseMs / 1000, offCenterS: r.offCenterMs / 1000, sparseBy: r.sparseBy, offBy: r.offBy, offscreen: r.offscreen, emptyAt: r.emptyAt, comfort: comfort(r) });
      } catch (error) { rows.push({ dir, file, error: String(error) }); }
    }
    const played = rows.filter((r) => r.seconds !== undefined);
    const share = (pred) => `${played.filter(pred).length}/${played.length}`;
    const mean = (key) => played.reduce((s, r) => s + r.comfort[key], 0) / Math.max(1, played.length);
    const sum = (key) => played.reduce((s, r) => s + r.comfort[key], 0);
    const origins = ["lesson", "follow", "range"].map((o) => [o, played.reduce((s, r) => s + r.comfort.byOrigin[o], 0)]);
    const lines = [
      "# Audit de la caméra (leçons enregistrées, voix simulée)", "",
      `**Score d'inconfort moyen : ${mean("score").toFixed(2)} par minute** (mouvement ${mean("motion").toFixed(2)}, lisibilité ${mean("readability").toFixed(2)}) — plus bas = mieux.`,
      `Mouvements par minute : ${mean("movesPerMin").toFixed(2)} ; écrans parcourus par minute : ${mean("travelPerMin").toFixed(2)} ; aller-retours : ${sum("back")} ; sauts sans transition : ${sum("jumps")} ; mouvements rapides : ${sum("fast")}.`,
      `Origine des mouvements : ${origins.map(([o, n]) => `${o === "lesson" ? "ordres du JSON (camera.focus/restore)" : o === "follow" ? "suivi automatique du moteur" : "plage d'un paramètre"} ${n}`).join(" ; ")}.`, "",
      `**Composition** (images immobiles) : remplissage moyen ${(played.reduce((s, r) => s + r.coverage * r.stillS, 0) / Math.max(1, played.reduce((s, r) => s + r.stillS, 0)) * 100).toFixed(0)} % ; `
        + `écran trop vide (< ${SPARSE * 100} %, caméra reculée) ${(played.reduce((s, r) => s + r.sparseS, 0) / Math.max(1, played.reduce((s, r) => s + r.stillS, 0)) * 100).toFixed(1)} % du temps ; `
        + `contenu décentré (> ${OFF_CENTER * 100} % d'écran) ${(played.reduce((s, r) => s + r.offCenterS, 0) / Math.max(1, played.reduce((s, r) => s + r.stillS, 0)) * 100).toFixed(1)} % du temps.`, "",
      `Qui a cadré l'image trop vide : ${Object.entries(played.reduce((a, r) => { for (const [k, v] of Object.entries(r.sparseBy)) a[k] = (a[k] ?? 0) + v / 1000; return a; }, {})).map(([k, v]) => `${k} ${v.toFixed(0)} s`).join(" ; ")} ; `
        + `décentrée : ${Object.entries(played.reduce((a, r) => { for (const [k, v] of Object.entries(r.offBy)) a[k] = (a[k] ?? 0) + v / 1000; return a; }, {})).map(([k, v]) => `${k} ${v.toFixed(0)} s`).join(" ; ")}.`, "",
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
