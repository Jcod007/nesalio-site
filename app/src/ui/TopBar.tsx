"use client";

import type { ReactNode } from "react";
import styles from "./TopBar.module.css";

interface Props {
  title: string | null;
  topic: string | null;
  demo: boolean;
  muted: boolean;
  onToggleMute(): void;
  onHome: (() => void) | null;
  /** Bouton « Signaler un problème » (testeurs). */
  feedback?: ReactNode;
}

export function TopBar({ title, topic, demo, muted, onToggleMute, onHome, feedback }: Props) {
  return (
    <header className={styles.bar}>
      <a className={styles.brand} href="https://nesalio.com" aria-label="Nesalio, retour au site">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 3 28 10 16 17 4 10Z" fill="#5A45D6" />
          <path d="M4 10 16 17v12L4 22Z" fill="#2E6BE6" />
          <path d="M28 10 16 17v12l12-7Z" fill="#23936A" />
        </svg>
        <span>Nesalio</span>
      </a>

      {title ? (
        <p className={styles.title}>
          <strong>{title}</strong>
          {topic ? <span>{topic}</span> : null}
        </p>
      ) : (
        <span className={styles.pill}>Accès anticipé</span>
      )}

      <div className={styles.actions}>
        {demo ? (
          <span className={styles.demo} title="Aucun modèle n'est branché : Nesa joue une séance préparée.">
            Démonstration
          </span>
        ) : null}
        {feedback}
        <button
          type="button"
          className={styles.icon}
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Réactiver la voix de Nesa" : "Couper la voix de Nesa"}
          title={muted ? "Réactiver la voix" : "Couper la voix"}
        >
          {muted ? <MutedIcon /> : <SoundIcon />}
        </button>
        {onHome ? (
          <button type="button" className="btn-line" onClick={onHome}>
            Nouvelle question
          </button>
        ) : null}
      </div>
    </header>
  );
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </svg>
  );
}
