"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createVoiceInput, type VoiceInput, type VoiceInputState } from "@/services/voice/voiceInput";
import { useTrialAccess } from "../TrialGate";

export interface VoiceInputControls {
  supported: boolean;
  ready: boolean;
  state: VoiceInputState;
  level: number;
  partial: string;
  error: string | null;
  /** Ouvre le micro ; `onResult` reçoit la phrase transcrite. */
  start(onResult: (text: string) => void): void;
  stop(): void;
  cancel(): void;
}

/** Le micro, branché sur l'état React (enregistrement, niveau, transcription). */
export function useVoiceInput(onStateChange?: (state: VoiceInputState) => void): VoiceInputControls {
  const trial = useTrialAccess();
  // Transcription is for accounts only, and the browser's own recognition is not used (it would send the
  // student's voice to Google, Apple or Microsoft): a guest in the trial writes the question.
  const guest = trial.enabled && !trial.authenticated;
  const input = useRef<VoiceInput | null>(null);
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<VoiceInputState>("idle");
  const [level, setLevel] = useState(0);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const notify = useRef(onStateChange);
  notify.current = onStateChange;

  useEffect(() => {
    input.current = createVoiceInput();
    setSupported(input.current.supported && !guest);
    setReady(true);
    return () => input.current?.cancel();
  }, [guest]);

  useEffect(() => notify.current?.(state), [state]);

  const start = useCallback((onResult: (text: string) => void) => {
    setError(null);
    setPartial("");
    input.current?.start({
      onState: setState,
      onLevel: setLevel,
      onPartial: setPartial,
      onResult: (text) => {
        setPartial("");
        onResult(text);
      },
      onError: setError,
    });
  }, []);

  return {
    supported,
    ready,
    state,
    level,
    partial,
    error,
    start,
    stop: useCallback(() => input.current?.stop(), []),
    cancel: useCallback(() => input.current?.cancel(), []),
  };
}
