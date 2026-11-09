"use client";

import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { INITIAL_SNAPSHOT, Player } from "@/engine/player";
import { createPlaybackClock } from "@/engine/playbackClock";
import { createBrowserSpeaker } from "@/services/voice/browserSpeaker";
import type { CloudSpeaker } from "@/services/voice/cloudSpeaker";
import { ManimBoard } from "./board/ManimBoard";
import type { Viewport } from "./board/manim/camera";
import { Caption } from "./Caption";
import type { ActiveInspection } from "./hooks/useTutor";
import styles from "./TutorInspection.module.css";

export function InspectionReplay({ entry, insets, play, paused, muted, liveSpeaker }: {
  entry: ActiveInspection;
  insets: Viewport["insets"];
  play: boolean;
  paused: boolean;
  muted: boolean;
  liveSpeaker: CloudSpeaker;
}) {
  const [deps] = useState(() => {
    const clock = createPlaybackClock();
    // La synthèse native est commune à tout l'onglet. Une voix en pause reste réservée au direct.
    const nativeVoice = typeof window !== "undefined" && !window.speechSynthesis?.paused;
    const speaker = liveSpeaker.fork(createBrowserSpeaker(clock, { nativeVoice, watchVoices: false }), clock);
    const player = new Player({ clock, speaker, source: {
      async *open() {
        yield { ...entry.step, check: undefined };
        yield { kind: "end", summary: [] };
      },
    } });
    // Le tableau rejoué a son propre accusé de rendu, même quand l'original est en pause sur le même état.
    const base = { ...(play ? entry.before : entry.after) };
    return { clock, speaker, player, base };
  });
  const snapshot = useSyncExternalStore(deps.player.subscribe, deps.player.getSnapshot, () => INITIAL_SNAPSHOT);
  const board = snapshot.status === "idle" ? deps.base : snapshot.board;

  useLayoutEffect(() => () => {
    deps.player.dispose();
    deps.clock.setPaused(false);
    deps.speaker.setPaused(false);
  }, [deps]);

  useLayoutEffect(() => {
    deps.clock.setPaused(paused);
    deps.speaker.setPaused(paused);
  }, [deps, paused]);

  useLayoutEffect(() => {
    deps.speaker.setMuted(muted);
  }, [deps, muted]);

  const start = useCallback(() => {
    if (play) deps.player.ask(entry.caption.text, deps.base);
  }, [deps, entry, play]);

  return (
    <>
      <ManimBoard board={board} insets={insets} clock={deps.clock} paused={paused} restore={deps.base} onReady={start} />
      <div className={styles.replayCaption} aria-label="Rejeu de l’étape" data-status={snapshot.status}>
        {snapshot.caption ? <Caption caption={snapshot.caption} speaking clock={deps.clock} paused={paused} />
          : <p>{play && snapshot.status !== "done" ? "Préparation du rejeu…" : entry.caption.text}</p>}
      </div>
    </>
  );
}
