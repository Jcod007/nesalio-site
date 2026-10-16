"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { INITIAL_SNAPSHOT, Player, type PlayerSnapshot } from "@/engine/player";
import { realClock } from "@/engine/ports";
import { createHttpSource } from "@/services/tutor/httpSource";
import { createBrowserSpeaker, type BrowserSpeaker } from "@/services/voice/browserSpeaker";

export interface Tutor {
  player: Player;
  speaker: BrowserSpeaker;
  snapshot: PlayerSnapshot;
}

/**
 * Assemble le lecteur avec ses implémentations réelles (voix du navigateur,
 * API du serveur, horloge). C'est le seul endroit qui fait ce câblage.
 */
export function useTutor(): Tutor {
  const [deps] = useState(() => {
    const speaker = createBrowserSpeaker();
    const player = new Player({ speaker, source: createHttpSource(), clock: realClock });
    return { speaker, player };
  });

  useEffect(() => () => deps.player.dispose(), [deps]);

  const snapshot = useSyncExternalStore(deps.player.subscribe, deps.player.getSnapshot, () => INITIAL_SNAPSHOT);
  return { ...deps, snapshot };
}
