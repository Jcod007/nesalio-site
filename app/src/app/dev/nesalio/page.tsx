"use client";

import { useEffect, useRef, useState } from "react";
import type { Slice } from "@/domain/nesalio/contract";
import type { LessonHeader } from "@/domain/nesalio/lesson";
import { validateLesson } from "@/domain/nesalio/validate";
import { playNesalioStream, type NesalioWarning } from "@/engine/nesalioPlayback";
import { openNesalioStream } from "@/services/nesalio/stream";
import { openNesalioClip } from "@/services/voice/nesalioClip";
import { openSimulatedClip } from "@/services/voice/simulatedClip";
import type { ManimRenderer } from "@/ui/board/manim/ManimRenderer";

export default function NesalioPlaybackPage() {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<ManimRenderer | null>(null);
  const run = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File>();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<NesalioWarning[]>([]);

  useEffect(
    () => () => {
      run.current?.abort();
      renderer.current?.dispose();
    },
    [],
  );

  /** Loads a lesson file, or asks the generator: both end in the same player. */
  async function start(source: "file" | "question") {
    if ((source === "file" ? !file : !question.trim()) || !host.current || run.current) return;
    const active = new AbortController();
    run.current = active;
    setBusy(true);
    setCaption("");
    setError("");
    setWarnings([]);
    setStatus(source === "file" ? "Préparation de la leçon…" : "Nesa prépare l’explication…");
    const askedAt = performance.now();
    let firstSound: number | null = null;
    try {
      let lesson: { header: LessonHeader; slices: AsyncIterable<Slice> };
      if (source === "file") {
        if (file!.size > 128_000) throw new Error("Le document dépasse 128 Ko.");
        const parsed = validateLesson(JSON.parse(await file!.text()));
        if (!parsed.ok) throw new Error(parsed.issues.map(({ path, message }) => `${path.join(".")} — ${message}`).join("\n"));
        lesson = {
          header: parsed.value,
          slices: (async function* () {
            yield* parsed.value.slices;
          })(),
        };
      } else {
        lesson = await openNesalioStream(question, active.signal);
      }
      await document.fonts.ready;
      const { ManimRenderer } = await import("@/ui/board/manim/ManimRenderer");
      if (active.signal.aborted || !host.current) return;
      renderer.current?.dispose();
      const board = new ManimRenderer(host.current);
      renderer.current = board;
      const projection = board.nesalioProjection();
      await playNesalioStream(lesson.header, lesson.slices, {
        viewport: { x0: -8, y0: -4.5, x1: 8, y1: 4.5 },
        signal: active.signal,
        // ?voix=simulee: a silent voice with the real pace, to film and judge the board without paying for speech.
        openClip: new URLSearchParams(window.location.search).get("voix") === "simulee" ? openSimulatedClip : openNesalioClip,
        prepareSlice: (slice, signal, math, values) => projection.prepareSlice(slice, signal, math, values),
        measure: projection.measure,
        onWarning(warning) {
          setWarnings((previous) => [...previous, warning]);
        },
        onWaiting() {
          setStatus("Nesa écrit la suite…");
        },
        onFrame(frame, beat, playhead) {
          board.drawNesalio(frame);
          setCaption(beat.say);
          if (firstSound === null && playhead > 0) firstSound = Math.round(performance.now() - askedAt);
          setStatus(firstSound === null ? "Lecture en cours" : `Lecture en cours — premier son après ${(firstSound / 1000).toFixed(1)} s`);
        },
      });
      if (!active.signal.aborted)
        setStatus(firstSound === null ? "Explication terminée" : `Explication terminée — premier son après ${(firstSound / 1000).toFixed(1)} s`);
    } catch (failure) {
      if (!active.signal.aborted) {
        setStatus("");
        setError(failure instanceof Error ? failure.message : "La lecture n’a pas abouti.");
      }
    } finally {
      if (run.current === active) run.current = null;
      if (!active.signal.aborted) setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 1200, margin: "auto", padding: 24 }}>
      <h1>Lecture Nesalio v3.3</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void start("question");
        }}
      >
        <label htmlFor="nesalio-question">Question</label>{" "}
        <input
          id="nesalio-question"
          type="text"
          maxLength={500}
          size={50}
          value={question}
          disabled={busy}
          placeholder="Explique-moi une fonction logarithme"
          onChange={(event) => setQuestion(event.currentTarget.value)}
        />{" "}
        <button type="submit" disabled={busy || !question.trim()}>
          Générer et lire
        </button>
      </form>
      <p>
        <label htmlFor="nesalio-lesson">Leçon JSON</label>{" "}
        <input id="nesalio-lesson" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => setFile(event.currentTarget.files?.[0])} />{" "}
        <button type="button" disabled={busy || !file} onClick={() => void start("file")}>
          Lire la leçon
        </button>
      </p>
      <p role="status">{status}</p>
      {error ? (
        <p role="alert" style={{ whiteSpace: "pre-wrap" }}>
          {error}
        </p>
      ) : null}
      {warnings.length ? (
        <ul aria-label="Avertissements de lecture">
          {warnings.map((warning, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: liste d'avertissements en ajout seul, jamais réordonnée
            <li key={index}>
              {warning.beat} —{" "}
              {warning.kind === "silent" ? "sans voix" : `${warning.kind === "framing" ? "cadrage" : "reporté"}${warning.action ? ` (${warning.action})` : ""}`}{" "}
              : {warning.reason}
            </li>
          ))}
        </ul>
      ) : null}
      <div ref={host} aria-label="Tableau de la leçon" role="img" style={{ width: "100%", aspectRatio: "16 / 9", overflow: "hidden" }} />
      <p aria-live="polite">{caption}</p>
    </main>
  );
}
