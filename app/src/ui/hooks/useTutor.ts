"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { INITIAL_SNAPSHOT, Player, type PlaybackFrame } from "@/engine/player";
import { realClock } from "@/engine/ports";
import { createPlaybackClock } from "@/engine/playbackClock";
import type { StepEventT } from "@/domain/scene/schema";
import { createHttpSource, type StepInspection } from "@/services/tutor/httpSource";
import { createBrowserSpeaker } from "@/services/voice/browserSpeaker";
import { createCloudSpeaker } from "@/services/voice/cloudSpeaker";

export interface ActiveInspection extends StepInspection {
  step: StepEventT;
  part: number;
  parts: number;
  before: PlaybackFrame["before"];
  after: PlaybackFrame["after"];
  caption: PlaybackFrame["caption"];
}

/**
 * Assemble le lecteur avec ses implémentations réelles (voix générée,
 * API du serveur, horloge). C'est le seul endroit qui fait ce câblage.
 */
export function useTutor(inspection: boolean) {
  const [inspectionHistory, setInspectionHistory] = useState<ActiveInspection[]>([]);
  const [deps] = useState(() => {
    // Voix naturelle générée par le serveur, avec la voix du navigateur en secours.
    const playback = inspection ? createPlaybackClock() : null;
    const clock = playback ?? realClock;
    const speaker = createCloudSpeaker(createBrowserSpeaker(clock), "/api/voice", clock);
    const traces = inspection ? new WeakMap<StepEventT, StepInspection>() : undefined;
    const player = new Player({ speaker, source: createHttpSource("/api/tutor", traces), clock,
      onPlaybackStep: traces ? ({ step, part, before, after, caption }) => {
        const trace = traces.get(step);
        if (trace) setInspectionHistory((history) => {
          const last = history.at(-1);
          const entry = { ...trace, step, part: part + 1, parts: step.segments?.length ?? 1,
            before: last?.step === step ? last.before : before, after, caption };
          return last?.step === step ? [...history.slice(0, -1), entry] : [...history, entry];
        });
      } : undefined,
    });
    return { speaker, player, clock, playback };
  });

  useEffect(() => () => {
    deps.player.dispose();
    deps.playback?.setPaused(false);
    deps.speaker.setPaused(false);
  }, [deps]);

  const snapshot = useSyncExternalStore(deps.player.subscribe, deps.player.getSnapshot, () => INITIAL_SNAPSHOT);
  return { ...deps, snapshot, inspectionHistory, setInspectionHistory };
}
