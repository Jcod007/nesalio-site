"use client";

import { SUGGESTED_QUESTIONS } from "@/content/demoLessons";
import { Nesa } from "./Nesa";
import { QuestionInput } from "./QuestionInput";
import styles from "./StartScreen.module.css";

interface Props {
  onAsk(question: string): void;
  listening: boolean;
  onListeningChange(listening: boolean): void;
  inspection?: boolean;
  /** Text under the title; the default describes the tutor (it can be interrupted). */
  lede?: string;
}

/** Écran d'accueil : une seule action, poser sa question. */
export function StartScreen({ onAsk, listening, onListeningChange, inspection, lede }: Props) {
  return (
    <section className={styles.start} aria-labelledby="start-title">
      <Nesa state={listening ? "ecoute" : "clin"} size={112} />
      <h1 id="start-title">Sur quelle notion tu bloques ?</h1>
      <p className={styles.lede}>
        {lede ?? "Pose ta question à voix haute ou écris-la. Nesa t'explique en dessinant au tableau, et tu peux l'interrompre quand tu veux."}
      </p>
      <QuestionInput
        size="large"
        placeholder="Ex. : comment je trouve les zéros d'une parabole ?"
        onSubmit={onAsk}
        onListeningChange={onListeningChange}
        submitLabel="Demander à Nesa"
        autoFocus
      />
      {inspection === true ? (
        <p className={styles.sound}><strong>Inspection JSON activée.</strong> Pose une question pour afficher les deux sorties. <a href="?inspect=0">Désactiver</a></p>
      ) : inspection === false ? <a className="btn-line" href="?inspect=1">Inspecter le JSON</a> : null}
      <div className={styles.suggestions}>
        <span>Pour essayer :</span>
        {SUGGESTED_QUESTIONS.map((question) => (
          <button key={question} type="button" onClick={() => onAsk(question)}>
            {question}
          </button>
        ))}
      </div>
      <p className={styles.sound}>Active le son : Nesa parle.</p>
      <p className={styles.privacy}>
        Les échanges peuvent être conservés pour améliorer Nesalio. Évite de partager des renseignements personnels dans tes questions.{" "}
        <a href="https://nesalio.com/confidentialite" target="_blank" rel="noopener">
          En savoir plus
        </a>
      </p>
    </section>
  );
}
