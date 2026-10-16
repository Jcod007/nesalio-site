"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { INITIAL_SNAPSHOT, Player, type PlayerSnapshot } from "@/engine/player";
import { realClock } from "@/engine/ports";
import { createHttpSource } from "@/services/tutor/httpSource";
import { createBrowserSpeaker } from "@/services/voice/browserSpeaker";
import { createCloudSpeaker, type CloudSpeaker } from "@/services/voice/cloudSpeaker";

export interface Tutor {
  player: Player;
  speaker: CloudSpeaker;
  snapshot: PlayerSnapshot;
}

/**
 * Assemble le lecteur avec ses implémentations réelles (voix générée,
 * API du serveur, horloge). C'est le seul endroit qui fait ce câblage.
 */
export function useTutor(): Tutor {
  const [deps] = useState(() => {
    // Voix naturelle générée par le serveur, avec la voix du navigateur en secours.
    const speaker = createCloudSpeaker(createBrowserSpeaker());
    const player = new Player({ speaker, source: createHttpSource(), clock: realClock });
    return { speaker, player };
  });

  useEffect(() => () => deps.player.dispose(), [deps]);

  const snapshot = useSyncExternalStore(deps.player.subscribe, deps.player.getSnapshot, () => INITIAL_SNAPSHOT);
  return { ...deps, snapshot };
}
