"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { STUDIO_DEMOS, roseVideo } from "@/content/studioDemos";
import { summarizeBoard } from "@/domain/board/state";
import { checkVideo, type Finding } from "@/domain/studio/check";
import { composeScore, hashText, STYLE_BPM } from "@/domain/studio/score";
import {
  createStudioParser,
  MAX_BARS,
  MAX_SHOTS,
  MUSIC_STYLES,
  parseStudioText,
  StudioScriptSchema,
  type Shot,
  type StudioScript,
  type VideoFormat,
} from "@/domain/studio/script";
import { boardBeforeShot } from "@/domain/studio/stage";
import { buildTimeline } from "@/domain/studio/timeline";
import { realClock } from "@/engine/ports";
import { StudioPlayer } from "@/engine/studioPlayer";
import { MusicDeck, pickRecordingType, recordVideo } from "@/services/studio/media";
import { importTrack, renderScore, trimTrack, type ImportedTrack } from "@/services/studio/synth";
import { StudioStage } from "./StudioStage";
import { Timebar } from "./Timebar";
import styles from "./Studio.module.css";

const FORMATS: { id: VideoFormat; label: string; example: string }[] = [
  { id: "devine", label: "Devine ce que ça dessine", example: "Une équation polaire qui dessine une fleur, puis on change un nombre et le nombre de pétales change." },
  { id: "notion", label: "Une notion en 30 s", example: "Pourquoi le sommet d'une parabole est au milieu de ses deux zéros (sec 4 SN)." },
  { id: "physique", label: "La physique cachée", example: "La physique d'un lancer franc au basket : pourquoi la trajectoire est une parabole." },
  { id: "libre", label: "Libre", example: "" },
];

const CODE_KEY = "nesalio-studio-code";
const LEAD_MS = 220;

function readCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}
function saveCode(code: string) {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {
    // stockage indisponible : le code reste pour la page en cours
  }
}

const describeAction = (action: Shot["do"][number]) => {
  const record = action as unknown as Record<string, unknown>;
  const name = typeof record.id === "string" ? record.id : typeof record.target === "string" ? `→ ${record.target}` : "";
  return `${action.type}${name ? ` ${name}` : ""}`;
};

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export function StudioApp() {
  const player = useMemo(() => new StudioPlayer(realClock), []);
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const deck = useRef<MusicDeck | null>(null);
  const recordStream = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [script, setScript] = useState<StudioScript>(roseVideo);
  const [format, setFormat] = useState<VideoFormat>("devine");
  const [prompt, setPrompt] = useState("");
  const [entry, setEntry] = useState<"idee" | "coller">("idee");
  const [pasted, setPasted] = useState("");
  const [origin, setOrigin] = useState("Exemple");
  const [busy, setBusy] = useState<null | "generate" | "revise" | "export" | "track">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [access, setAccess] = useState<{ locked: boolean; ai: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [track, setTrack] = useState<ImportedTrack | null>(null);
  const [music, setMusic] = useState<AudioBuffer | null>(null);
  const [musicPending, setMusicPending] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [instructions, setInstructions] = useState<Record<number, string>>({});
  const [jsonOpen, setJsonOpen] = useState<number | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [progress, setProgress] = useState(0);
  const [exported, setExported] = useState<{ url: string; file: File; stalls: number } | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const onCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  useEffect(() => {
    deck.current = new MusicDeck();
    setCode(readCode());
    fetch("/api/studio")
      .then((r) => r.json())
      .then((data: { locked: boolean; ai: boolean }) => setAccess(data))
      .catch(() => setAccess({ locked: true, ai: false }));
    return () => {
      deck.current?.dispose();
      player.dispose();
    };
  }, [player]);

  const bpm = track ? track.tempo.bpm : STYLE_BPM[script.music];
  const timeline = useMemo(() => buildTimeline(script, { bpm }), [script, bpm]);
  const findings = useMemo(() => checkVideo(script, timeline), [script, timeline]);
  const byShot = useMemo(() => {
    const map = new Map<number | null, Finding[]>();
    for (const f of findings) map.set(f.shot, [...(map.get(f.shot) ?? []), f]);
    return map;
  }, [findings]);
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warn").length;

  // La musique suit la vidéo : recomposée (ou recoupée) quand la chronologie change.
  useEffect(() => {
    let cancelled = false;
    setMusicPending(true);
    const timer = setTimeout(async () => {
      try {
        const buffer = track
          ? await trimTrack(track.buffer, track.tempo.offsetMs / 1000, timeline.totalMs / 1000)
          : await renderScore(composeScore(timeline, { style: script.music, seed: hashText(script.title) }));
        if (!cancelled) setMusic(buffer);
      } catch (err) {
        console.error("musique", err);
        if (!cancelled) setMusic(null);
      } finally {
        if (!cancelled) setMusicPending(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [timeline, script.music, script.title, track]);

  /* ------------------------------- lecture ------------------------------- */

  const stop = useCallback(() => {
    deck.current?.stop();
    player.stop();
  }, [player]);

  const playFrom = useCallback(
    async (position: number) => {
      const shot = timeline.shots[position];
      if (!shot) return;
      await deck.current?.unlock();
      deck.current?.play(music, shot.startMs, LEAD_MS);
      player.play(timeline, position, LEAD_MS);
      setSelected(shot.index);
    },
    [music, player, timeline],
  );

  /** Remplace le script ; l'aperçu repart du début. */
  const loadScript = useCallback(
    (next: StudioScript, label: string) => {
      stop();
      player.reset();
      setScript(next);
      setOrigin(label);
      setSelected(null);
      setJsonOpen(null);
      setExported(null);
    },
    [player, stop],
  );

  const editScript = useCallback(
    (change: (current: StudioScript) => StudioScript) => {
      stop();
      player.reset();
      setScript((current) => change(current));
      setExported(null);
    },
    [player, stop],
  );

  const editShot = (index: number, patch: Partial<Shot>) =>
    editScript((s) => ({ ...s, shots: s.shots.map((shot, i) => (i === index ? { ...shot, ...patch } : shot)) }));

  /* ----------------------------- serveur (IA) ----------------------------- */

  async function callStudio<T>(body: unknown): Promise<T> {
    const response = await fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-studio-code": code },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `Erreur ${response.status}`);
    return data;
  }

  async function generate() {
    setError(null);
    setNotice(null);
    setBusy("generate");
    try {
      const data = await callStudio<{ source: "model" | "demo"; script: unknown; issues: string[] }>({ action: "generate", prompt, format });
      const parsed = StudioScriptSchema.safeParse(data.script);
      if (!parsed.success) throw new Error("Réponse inattendue du serveur.");
      loadScript(parsed.data as StudioScript, data.source === "model" ? "Généré par l'IA" : "Exemple (aucune IA branchée)");
      if (data.source === "demo") setNotice("Aucun modèle d'IA n'est branché sur ce serveur : voici l'exemple le plus proche de ton idée.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function importPasted() {
    setError(null);
    const { script: parsed, issues } = parseStudioText(pasted);
    if (!parsed) {
      setError("Aucun plan lisible dans ce texte. Il faut des lignes JSON {\"kind\":\"step\",…} (bouton « Copier les consignes »).");
      return;
    }
    loadScript(parsed, "Collé depuis une autre IA");
    setNotice(issues.length > 0 ? `${issues.length} ligne(s) ou commande(s) écartée(s) : voir la vérification.` : null);
  }

  async function copyInstructions() {
    setError(null);
    try {
      const text = await fetch(`/api/studio?consignes=${format}`).then((r) => r.text());
      await navigator.clipboard.writeText(`${text}\n\nIdée de vidéo : ${prompt || "(décris ton idée ici)"}`);
      setNotice("Consignes copiées : colle-les dans ton autre IA, puis colle sa réponse ici.");
    } catch {
      setError("Impossible de copier automatiquement : ouvre /api/studio?consignes=" + format + " et copie le texte.");
    }
  }

  async function revise(index: number) {
    const instruction = instructions[index]?.trim();
    if (!instruction) return;
    setError(null);
    setBusy("revise");
    try {
      const position = timeline.shots.findIndex((s) => s.index === index);
      const board = summarizeBoard(boardBeforeShot(timeline, Math.max(0, position), 0))
        .slice(0, 40)
        .map((item) => `${item.id} · ${item.type} · ${item.detail}`.slice(0, 300));
      const data = await callStudio<{ shots: Shot[]; issues: string[] }>({ action: "revise", script, shot: index, instruction, board, format });
      if (!data.shots?.length) throw new Error("Aucun plan proposé.");
      editScript((s) => ({ ...s, shots: [...s.shots.slice(0, index), ...data.shots, ...s.shots.slice(index + 1)].slice(0, MAX_SHOTS) }));
      setInstructions((all) => ({ ...all, [index]: "" }));
      setSelected(index);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function openJson(index: number) {
    const shot = script.shots[index]!;
    setJsonOpen(index);
    setJsonText(JSON.stringify({ kind: "step", say: shot.text, ...(shot.bars ? { bars: shot.bars } : {}), ...(shot.reveal ? { reveal: true } : {}), do: shot.do }, null, 1));
  }

  function applyJson(index: number) {
    const parser = createStudioParser();
    parser.push(jsonText.replace(/\n\s*/g, " "));
    const parsed = parser.result(script.title);
    if (!parsed) {
      setError("JSON illisible : il faut un objet {\"kind\":\"step\",\"say\":…,\"do\":[…]}.");
      return;
    }
    setError(null);
    editScript((s) => ({ ...s, shots: s.shots.map((shot, i) => (i === index ? parsed.shots[0]! : shot)) }));
    setJsonOpen(null);
  }

  /* -------------------------------- musique -------------------------------- */

  async function onTrack(file: File | undefined) {
    if (!file) return;
    setBusy("track");
    setError(null);
    try {
      const imported = await importTrack(file);
      stop();
      setTrack(imported);
      setNotice(
        imported.tempo.confidence < 0.2
          ? `Rythme peu net dans « ${imported.name} » : le calage sur les temps forts sera approximatif.`
          : `« ${imported.name} » : ${Math.round(imported.tempo.bpm)} BPM, premier temps fort à ${(imported.tempo.offsetMs / 1000).toFixed(2)} s.`,
      );
    } catch {
      setError("Ce fichier audio n'a pas pu être lu (essaie un MP3 ou un WAV).");
    } finally {
      setBusy(null);
    }
  }

  /* --------------------------------- export --------------------------------- */

  async function exportVideo() {
    const canvas = canvasRef.current;
    if (!canvas || !deck.current) return;
    setError(null);
    setBusy("export");
    setProgress(0);
    if (exported) URL.revokeObjectURL(exported.url);
    setExported(null);
    const abort = new AbortController();
    exportAbort.current = abort;
    try {
      await deck.current.unlock();
      recordStream.current ??= deck.current.stream();
      stop();
      const recording = await recordVideo({
        canvas,
        audio: music ? recordStream.current : null,
        durationMs: timeline.totalMs,
        signal: abort.signal,
        onProgress: setProgress,
        start: () => {
          deck.current?.play(music, 0, 0, false);
          player.play(timeline, 0, 0);
        },
      });
      const name = `nesalio-${script.title.replace(/œ/g, "oe").replace(/æ/g, "ae").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}.${recording.extension}`;
      const file = new File([recording.blob], name, { type: recording.blob.type });
      setExported({ url: URL.createObjectURL(recording.blob), file, stalls: recording.stalls });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : String(err));
    } finally {
      stop();
      setBusy(null);
      exportAbort.current = null;
    }
  }

  async function share() {
    if (!exported) return;
    try {
      await navigator.share({ files: [exported.file], title: script.title });
    } catch {
      // partage annulé
    }
  }

  const canShare = exported !== null && typeof navigator !== "undefined" && "canShare" in navigator && navigator.canShare?.({ files: [exported.file] });
  // Connu seulement dans le navigateur (après le premier rendu, pour que le HTML du serveur corresponde).
  const [recordingType, setRecordingType] = useState<ReturnType<typeof pickRecordingType> | "unknown">("unknown");
  useEffect(() => setRecordingType(pickRecordingType()), []);
  const needsCode = access?.locked === true;
  const playing = snapshot.status === "playing";
  const activePosition = playing ? snapshot.position : -1;
  const activeIndex = activePosition >= 0 ? timeline.shots[activePosition]?.index : undefined;

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <header className={styles.header}>
          <h1>Nesalio Studio</h1>
          <span className={styles.badge}>Vidéos TikTok · interne</span>
          <p>Une idée ou un script, un aperçu vérifié plan par plan, puis la vidéo verticale avec sa musique libre de droits.</p>
        </header>

        <div className={styles.stageColumn}>
          <StudioStage script={script} timeline={timeline} snapshot={snapshot} onCanvas={onCanvas} />
          <Timebar timeline={timeline} snapshot={snapshot} findings={findings} selected={selected} onPick={(position) => void playFrom(position)} />
          <div className={styles.transport}>
            {playing ? (
              <button type="button" className="btn-line" onClick={stop} disabled={busy === "export"}>
                ■ Arrêter
              </button>
            ) : (
              <button type="button" className="cta" onClick={() => void playFrom(0)} disabled={busy === "export" || musicPending}>
                ▶ {musicPending ? "Musique…" : "Lire"}
              </button>
            )}
            {selected !== null && !playing ? (
              <button type="button" className="btn-line" onClick={() => void playFrom(Math.max(0, timeline.shots.findIndex((s) => s.index === selected)))}>
                Plan {selected + 1}
              </button>
            ) : null}
            <span className={styles.time}>
              {timeline.shots.length} plans · {fmt(timeline.totalMs)} · {Math.round(bpm)} BPM
            </span>
          </div>
        </div>

        <div className={styles.panels}>
          {needsCode ? (
            <section className={styles.panel}>
              <label className={styles.field}>
                Code du studio (STUDIO_TOKEN, ou SELFTEST_TOKEN s'il n'est pas défini)
                <input
                  className={styles.input}
                  type="password"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    saveCode(e.target.value);
                  }}
                  autoComplete="off"
                />
              </label>
              <p className={styles.hint}>Il ne sert qu'aux appels à l'IA. Les exemples, le script collé, l'aperçu et l'export marchent sans.</p>
            </section>
          ) : null}

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {notice ? <p className={styles.hint}>{notice}</p> : null}

          {/* 1. Idée ou script */}
          <section className={styles.panel}>
            <h2>
              <span className={styles.step}>1</span> Le scénario
            </h2>
            <div className={styles.chips} role="group" aria-label="Format">
              {FORMATS.map((f) => (
                <button key={f.id} type="button" className={styles.chip} aria-pressed={format === f.id} onClick={() => setFormat(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className={styles.chips} role="group" aria-label="Source du scénario">
              <button type="button" className={styles.chip} aria-pressed={entry === "idee"} onClick={() => setEntry("idee")}>
                Décrire l'idée (IA du studio)
              </button>
              <button type="button" className={styles.chip} aria-pressed={entry === "coller"} onClick={() => setEntry("coller")}>
                Coller un script (autre IA)
              </button>
            </div>

            {entry === "idee" ? (
              <>
                <textarea
                  className={styles.textarea}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={FORMATS.find((f) => f.id === format)?.example || "Décris la vidéo : le sujet, la chute, le ton, ce qui doit se dessiner…"}
                  rows={5}
                />
                <div className={styles.row}>
                  <button type="button" className="cta" onClick={() => void generate()} disabled={busy !== null || prompt.trim().length < 3}>
                    {busy === "generate" ? "Écriture du script…" : "Générer le script"}
                  </button>
                  {access && !access.ai ? <span className={styles.hint}>Aucune IA branchée : un exemple sera proposé.</span> : null}
                </div>
              </>
            ) : (
              <>
                <p className={styles.hint}>
                  Donne les consignes à ton autre IA avec ton idée, puis colle sa réponse ici (lignes JSON). Le texte autour est ignoré.
                </p>
                <div className={styles.row}>
                  <button type="button" className="btn-line" onClick={() => void copyInstructions()}>
                    Copier les consignes
                  </button>
                </div>
                <textarea
                  className={`${styles.textarea} ${styles.code}`}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder={'{"kind":"lesson","title":"…","hook":"…","music":"lofi"}\n{"kind":"step","say":"…","bars":2,"do":[…]}\n{"kind":"end","cta":"…"}'}
                  rows={7}
                />
                <div className={styles.row}>
                  <button type="button" className="cta" onClick={importPasted} disabled={pasted.trim().length === 0}>
                    Charger le script
                  </button>
                </div>
              </>
            )}

            <div className={styles.row}>
              <span className={styles.hint}>Exemples :</span>
              {STUDIO_DEMOS.map((demo) => (
                <button key={demo.title} type="button" className={styles.linkButton} onClick={() => loadScript(demo, "Exemple")}>
                  {demo.title}
                </button>
              ))}
            </div>
          </section>

          {/* 2. Vérifier et corriger */}
          <section className={styles.panel}>
            <h2>
              <span className={styles.step}>2</span> Vérifier et corriger
              <span className={styles.badge}>{origin}</span>
            </h2>
            <div className={styles.summary}>
              {errors > 0 ? <span className={styles.count} data-level="error">{errors} à corriger</span> : null}
              {warnings > 0 ? <span className={styles.count} data-level="warn">{warnings} à surveiller</span> : null}
              {errors === 0 && warnings === 0 ? <span className={styles.count} data-level="ok">Rien à signaler</span> : null}
            </div>
            {byShot.get(null)?.length ? (
              <ul className={styles.findings}>
                {byShot.get(null)!.map((f, i) => (
                  <li key={i} className={styles.finding} data-level={f.severity}>
                    {f.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className={styles.hint}>
              La vérification relit chaque plan comme il sera joué. Pour ce qu'elle ne voit pas (un tracé bizarre, une couleur), regarde le plan à
              l'aperçu, puis corrige-le à la main ou avec une consigne à l'IA : seul ce plan est refait.
            </p>

            <div className={styles.row}>
              <label className={`${styles.field} ${styles.grow}`}>
                Accroche (1re seconde)
                <input className={styles.input} value={script.hook} maxLength={80} onChange={(e) => editScript((s) => ({ ...s, hook: e.target.value }))} />
              </label>
              <label className={`${styles.field} ${styles.grow}`}>
                Titre (en haut ensuite)
                <input className={styles.input} value={script.title} maxLength={80} onChange={(e) => editScript((s) => ({ ...s, title: e.target.value }))} />
              </label>
            </div>

            <ol className={styles.shots}>
              {script.shots.map((shot, index) => {
                const planned = timeline.shots.find((s) => s.index === index);
                const shotFindings = byShot.get(index) ?? [];
                return (
                  <li key={index} className={styles.shot} data-active={index === (activeIndex ?? selected)}>
                    <div className={styles.shotHead}>
                      <span className={styles.shotNumber}>{index + 1}</span>
                      <span className={styles.shotMeta}>
                        {planned ? `${planned.bars} mes. · ${(planned.durationMs / 1000).toFixed(1)} s` : "retiré (trop long)"}
                      </span>
                      <div className={styles.shotTools}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          title="Voir ce plan"
                          disabled={!planned || busy === "export"}
                          onClick={() => void playFrom(timeline.shots.findIndex((s) => s.index === index))}
                        >
                          ▶
                        </button>
                        <button type="button" className={styles.iconButton} title="Monter" disabled={index === 0} onClick={() => editScript((s) => ({ ...s, shots: swap(s.shots, index, index - 1) }))}>
                          ↑
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          title="Descendre"
                          disabled={index === script.shots.length - 1}
                          onClick={() => editScript((s) => ({ ...s, shots: swap(s.shots, index, index + 1) }))}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          title="Supprimer"
                          disabled={script.shots.length <= 1}
                          onClick={() => editScript((s) => ({ ...s, shots: s.shots.filter((_, i) => i !== index) }))}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <input className={styles.input} value={shot.text} maxLength={100} aria-label={`Texte du plan ${index + 1}`} onChange={(e) => editShot(index, { text: e.target.value })} />
                    <div className={styles.row}>
                      <label className={styles.check}>
                        Durée
                        <select
                          className={styles.select}
                          style={{ width: "auto", padding: "4px 8px" }}
                          value={shot.bars ?? 0}
                          onChange={(e) => editShot(index, { bars: Number(e.target.value) || undefined })}
                        >
                          <option value={0}>auto</option>
                          {Array.from({ length: MAX_BARS }, (_, i) => (
                            <option key={i + 1} value={i + 1}>
                              {i + 1} mesure{i > 0 ? "s" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.check}>
                        <input type="checkbox" checked={shot.reveal === true} onChange={(e) => editShot(index, { reveal: e.target.checked || undefined })} />
                        Révélation (la musique frappe)
                      </label>
                      <button type="button" className={styles.linkButton} onClick={() => (jsonOpen === index ? setJsonOpen(null) : openJson(index))}>
                        {jsonOpen === index ? "Fermer le JSON" : "Modifier le JSON"}
                      </button>
                    </div>
                    <p className={styles.commands}>{shot.do.length > 0 ? shot.do.map(describeAction).join(" · ") : "aucune commande"}</p>
                    {jsonOpen === index ? (
                      <>
                        <textarea className={`${styles.textarea} ${styles.code}`} value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={8} />
                        <div className={styles.row}>
                          <button type="button" className="btn-line" onClick={() => applyJson(index)}>
                            Appliquer
                          </button>
                        </div>
                      </>
                    ) : null}
                    {shotFindings.length > 0 ? (
                      <ul className={styles.findings}>
                        {shotFindings.map((f, i) => (
                          <li key={i} className={styles.finding} data-level={f.severity}>
                            {f.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className={styles.row}>
                      <input
                        className={`${styles.input} ${styles.grow}`}
                        placeholder="Consigne pour l'IA : « la fleur déborde, rapetisse-la »"
                        value={instructions[index] ?? ""}
                        onChange={(e) => setInstructions((all) => ({ ...all, [index]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void revise(index);
                        }}
                      />
                      <button type="button" className="btn-line" disabled={busy !== null || !(instructions[index] ?? "").trim()} onClick={() => void revise(index)}>
                        {busy === "revise" ? "…" : "Refaire ce plan"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className={styles.row}>
              <button
                type="button"
                className="btn-line"
                disabled={script.shots.length >= MAX_SHOTS}
                onClick={() => editScript((s) => ({ ...s, shots: [...s.shots, { text: "Nouveau plan", do: [] }] }))}
              >
                + Ajouter un plan
              </button>
            </div>
            <label className={styles.field}>
              Phrase de fin (avant nesalio.com)
              <input className={styles.input} value={script.cta} maxLength={100} onChange={(e) => editScript((s) => ({ ...s, cta: e.target.value }))} />
            </label>
          </section>

          {/* 3. Musique */}
          <section className={styles.panel}>
            <h2>
              <span className={styles.step}>3</span> La musique
            </h2>
            <div className={styles.chips} role="group" aria-label="Ambiance">
              {MUSIC_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  className={styles.chip}
                  aria-pressed={!track && script.music === style.id}
                  onClick={() => {
                    setTrack(null);
                    editScript((s) => ({ ...s, music: style.id }));
                  }}
                >
                  {style.label}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              Composée par le studio pour cette vidéo, avec ses propres sons : libre de droits. Chaque plan tombe sur un temps fort, et la musique
              monte avant la révélation.
            </p>
            <div className={styles.row}>
              <label className="btn-line">
                {busy === "track" ? "Analyse du rythme…" : "Importer mon morceau"}
                <input type="file" accept="audio/*" hidden onChange={(e) => void onTrack(e.target.files?.[0])} />
              </label>
              {track ? (
                <button type="button" className={styles.linkButton} onClick={() => setTrack(null)}>
                  Revenir à la musique du studio
                </button>
              ) : null}
            </div>
            <p className={styles.hint}>
              Un morceau importé doit être libre de droits pour un usage commercial. Pour une publicité payante, TikTok demande une musique de sa
              bibliothèque commerciale : exporte alors sans ton morceau et ajoute-la dans l'appli.
            </p>
          </section>

          {/* 4. Export */}
          <section className={styles.panel}>
            <h2>
              <span className={styles.step}>4</span> La vidéo
            </h2>
            <p className={styles.hint}>
              L'export rejoue la vidéo en temps réel ({fmt(timeline.totalMs)}) et l'enregistre en 1080 × 1920
              {recordingType && recordingType !== "unknown" ? ` (${recordingType.extension.toUpperCase()})` : ""}. Garde cet onglet au premier plan pendant ce temps.
            </p>
            {errors > 0 ? <p className={styles.hint}>Il reste {errors} point(s) à corriger : tu peux exporter quand même, mais ça se verra.</p> : null}
            <div className={styles.row}>
              {busy === "export" ? (
                <button type="button" className="btn-line" onClick={() => exportAbort.current?.abort()}>
                  Annuler
                </button>
              ) : (
                <button type="button" className="cta" onClick={() => void exportVideo()} disabled={busy !== null || musicPending || recordingType === null}>
                  Créer la vidéo
                </button>
              )}
              {recordingType === null ? <span className={styles.hint}>Ce navigateur ne sait pas enregistrer de vidéo : utilise Chrome ou Edge.</span> : null}
            </div>
            {busy === "export" ? (
              <div className={styles.progress} aria-label="Progression de l'export">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            ) : null}
            {exported ? (
              <div className={styles.result}>
                <video src={exported.url} controls playsInline />
                <div className={styles.row} style={{ alignItems: "flex-start", flexDirection: "column" }}>
                  <a className="cta" href={exported.url} download={exported.file.name}>
                    Télécharger
                  </a>
                  {canShare ? (
                    <button type="button" className="btn-line" onClick={() => void share()}>
                      Partager (TikTok…)
                    </button>
                  ) : null}
                  <span className={styles.hint}>{exported.file.name}</span>
                  {exported.stalls > 0 ? (
                    <p className={styles.error}>
                      L'image s'est figée {exported.stalls} fois pendant l'enregistrement (ordinateur occupé) : regarde la vidéo, et relance
                      l'export en fermant les autres onglets si ça se voit.
                    </p>
                  ) : (
                    <span className={styles.hint}>Enregistrement fluide, aucune image figée.</span>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function swap<T>(items: T[], a: number, b: number): T[] {
  const next = [...items];
  [next[a], next[b]] = [next[b]!, next[a]!];
  return next;
}
