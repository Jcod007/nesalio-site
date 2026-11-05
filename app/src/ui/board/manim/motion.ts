/**
 * Animations de mouvement du rendu : glissement et rotation relatifs (qui
 * s'enchaînent dans une même étape), effacement complet d'un objet.
 */
import { FadeOut, UpdateFromAlphaFunc, type Animation, type Mobject } from "manim-web";
import type { TimedAnimation, Vec3 } from "./world";

/**
 * Glissement relatif : chaque image ajoute la part de chemin parcourue depuis
 * la précédente. Contrairement à Shift, qui retient sa position de départ dès
 * que le lot d'animations commence, deux glissements du même objet dans une
 * étape s'enchaînent correctement (aller, puis retour).
 */
export function slide(mobject: Mobject, delta: Vec3, seconds: number): Animation {
  let done = 0;
  return new UpdateFromAlphaFunc(
    mobject,
    (m, alpha) => {
      const step = alpha - done;
      done = alpha;
      if (step !== 0) m.shift([delta[0] * step, delta[1] * step, 0]);
    },
    { duration: seconds },
  );
}

/**
 * Rotation relative autour d'un pivot (monde), image par image, comme `slide` :
 * plusieurs rotations du même objet dans une étape s'enchaînent (un pendule qui
 * va et vient). Une étiquette (`turnShape` faux) glisse sur l'arc sans tourner.
 */
export function turn(mobject: Mobject, pivot: Vec3, radians: number, turnShape: boolean, seconds: number): Animation {
  let done = 0;
  return new UpdateFromAlphaFunc(
    mobject,
    (m, alpha) => {
      const step = (alpha - done) * radians;
      done = alpha;
      if (step === 0) return;
      if (turnShape) {
        m.rotate(step, { aboutPoint: pivot });
        return;
      }
      const [cx, cy] = m.getCenter();
      const dx = cx - pivot[0];
      const dy = cy - pivot[1];
      const c = Math.cos(step);
      const s = Math.sin(step);
      m.shift([pivot[0] + dx * c - dy * s - cx, pivot[1] + dx * s + dy * c - cy, 0]);
    },
    { duration: seconds },
  );
}

/**
 * Efface un objet et chacun de ses morceaux. Le repère de manim-web garde ses
 * graduations à l'écran si l'on n'efface que l'ensemble : c'était la cause des
 * graduations fantômes, à l'effacement comme au remplacement du repère.
 */
export function fadeAll(mobject: Mobject, seconds: number, when: Pick<TimedAnimation, "start" | "end">): TimedAnimation[] {
  return mobject.getFamily().map((part) => ({ animation: new FadeOut(part as Mobject, { duration: seconds }), ...when }));
}
