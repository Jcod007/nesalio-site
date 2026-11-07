import { z } from "zod";

export const BoardZone = z.enum(["idea", "example", "practice"]);
export type BoardZone = z.infer<typeof BoardZone>;

export const BOARD_ZONES = [
  { id: "idea", label: "Idée clé" },
  { id: "example", label: "Exemple" },
  { id: "practice", label: "À ton tour" },
] as const;

export const BOARD_TRANSITION_MS = 850;
