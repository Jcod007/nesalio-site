"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MAX_QUESTION_LENGTH } from "@/domain/tutor/request";
import { PHOTO_MAX_TEXT } from "@/domain/photo";
import { readPhoto } from "@/services/photo";
import { useVoiceInput } from "./hooks/useVoiceInput";
import { MicButton } from "./MicButton";
import styles from "./QuestionInput.module.css";

interface Props {
  placeholder: string;
  onSubmit(text: string): void;
  onListeningChange?(listening: boolean): void;
  autoFocus?: boolean;
  size?: "large" | "normal";
  submitLabel?: string;
}

/** Question écrite ou dictée, avec une photo dont l'énoncé peut être corrigé avant l'envoi. */
export function QuestionInput({ placeholder, onSubmit, onListeningChange, autoFocus, size = "normal", submitLabel = "Envoyer" }: Props) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ url: string; text: string; uncertainties: string[] } | null>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoRun = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const voice = useVoiceInput((state) => onListeningChange?.(state !== "idle"));
  const id = useId();
  const photoId = `${id}-photo`;

  useEffect(() => () => photoRun.current?.abort(), []);
  const photoUrl = photo?.url;
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  // Pendant la reconnaissance du navigateur, le texte apparaît au fur et à mesure.
  useEffect(() => {
    if (voice.partial) setText(voice.partial);
  }, [voice.partial]);

  const submit = (value: string) => {
    if (readingPhoto || (photo && !photo.text.trim())) return;
    const question = value.trim();
    if (!question && !photo) return;
    const request = photo
      ? `${question.slice(0, MAX_QUESTION_LENGTH) || "Explique-moi ce qui est sur cette photo."}\n\nContenu reconnu sur la photo :\n${photo.text.trim()}`
      : question.slice(0, MAX_QUESTION_LENGTH);
    onSubmit(request);
    setText("");
    setPhoto(null);
    setPhotoError(null);
  };

  const choosePhoto = async (file: File) => {
    voice.cancel();
    photoRun.current?.abort();
    const run = new AbortController();
    photoRun.current = run;
    setPhoto({ url: URL.createObjectURL(file), text: "", uncertainties: [] });
    setReadingPhoto(true);
    setPhotoError(null);
    try {
      const reading = await readPhoto(file, run.signal);
      if (!run.signal.aborted) setPhoto((current) => current && { ...current, ...reading });
    } catch (error) {
      if (!run.signal.aborted) {
        let message = "La lecture de la photo a échoué.";
        if (error instanceof TypeError) message = "Je n'arrive pas à lire la photo. Vérifie ta connexion.";
        else if (error instanceof Error) message = error.name === "TimeoutError"
          ? "La lecture de la photo a pris trop de temps. Réessaie."
          : error.message;
        setPhotoError(message);
      }
    } finally {
      if (!run.signal.aborted) setReadingPhoto(false);
    }
  };

  const removePhoto = () => {
    photoRun.current?.abort();
    setPhoto(null);
    setReadingPhoto(false);
    setPhotoError(null);
  };

  const listening = voice.state === "recording";
  const placeholderNow = listening ? "Je t'écoute…" : voice.state === "transcribing" ? "Je transcris ce que tu as dit…" : placeholder;
  const canSubmit = !readingPhoto && (photo ? !!photo.text.trim() : !!text.trim());

  return (
    <>
    <form
      className={styles.form}
      data-size={size}
      data-photo={photo ? "true" : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        submit(text);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div className={styles.field} data-listening={voice.state !== "idle"}>
        <input
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholderNow}
          maxLength={MAX_QUESTION_LENGTH}
          // biome-ignore lint/a11y/noAutofocus: le focus n'est donné que lorsque le parent le demande (écran d'accueil).
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="send"
        />
        <button type="button" className={styles.photoButton} onClick={() => {
          if (fileInput.current) {
            fileInput.current.value = "";
            fileInput.current.click();
          }
        }}
          aria-label="Ajouter une photo" title="Ajouter une photo d'exercice ou de cours" disabled={voice.state !== "idle"}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
        {!readingPhoto ? <MicButton voice={voice} onResult={submit} /> : null}
      </div>
      <button type="submit" className="cta" disabled={!canSubmit}>
        {submitLabel}
      </button>
      {voice.ready && !voice.supported ? <p className={styles.hint}>Écris ta question pour essayer.</p> : null}
      {photo ? (
        <div className={styles.photo} aria-busy={readingPhoto}>
          <div className={styles.photoHeading}>
            {/* Local preview, released when the photo is removed or replaced. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="Photo à expliquer" className={styles.preview} />
            <button type="button" className="btn-line" onClick={removePhoto} disabled={voice.state !== "idle"}>Retirer la photo</button>
          </div>
          {readingPhoto ? <p role="status">Je lis ta photo…</p> : null}
          {!readingPhoto && !photoError ? (
            <>
              <label htmlFor={photoId}>Vérifie le texte reconnu avant de demander l'explication.</label>
              <textarea id={photoId} value={photo.text} rows={5} maxLength={PHOTO_MAX_TEXT} readOnly={voice.state !== "idle"}
                onChange={(event) => setPhoto({ ...photo, text: event.target.value })} />
            </>
          ) : null}
          {photo.uncertainties.length ? (
            <p role="status">À vérifier sur la photo : {photo.uncertainties.join(" · ")}</p>
          ) : null}
        </div>
      ) : null}
      {photoError ? <p className={styles.error} role="alert">{photoError}</p> : null}
      {voice.error ? <p className={styles.error}>{voice.error}</p> : null}
    </form>
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Photo à expliquer"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void choosePhoto(file);
      }} />
    </>
  );
}
