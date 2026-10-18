/**
 * Commandes de caméra : zoomer sur une zone, revenir à la vue d'ensemble.
 */
import { z } from "zod";
import { Range } from "../primitives";
import { defineCommand } from "./define";

export const focusCommand = defineCommand({
  schema: z.object({ type: z.literal("focus"), x: Range, y: Range }),
  doc: '{"type":"focus","x":[min,max],"y":[min,max]} : zoome sur une zone.',
  duration: 1000,
  aliases: ["camera", "zoom"],
  apply(state, action, reveal) {
    return { ...state, camera: { kind: "fit", x: action.x, y: action.y, at: reveal.start, duration: reveal.duration } };
  },
});

export const resetViewCommand = defineCommand({
  schema: z.object({ type: z.literal("resetView") }),
  doc: '{"type":"resetView"} : revient à la vue d\'ensemble.',
  duration: 1000,
  apply(state, _action, reveal) {
    return { ...state, camera: { kind: "reset", at: reveal.start, duration: reveal.duration } };
  },
});
