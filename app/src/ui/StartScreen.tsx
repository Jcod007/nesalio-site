"use client";

import { SUGGESTED_QUESTIONS } from "@/content/demoLessons";
import { Nesa } from "./Nesa";
import { QuestionInput } from "./QuestionInput";
import styles from "./StartScreen.module.css";

interface Props {
  onAsk(question: string): void;
  listening: boolean;
  onListeningChange(listening: boolean): void;
}

/** Écran d'accueil : une seule action, poser sa question. */
export function StartScreen({ onAsk, listening, onListeningChange }: Props) {
  return (
    <section className={styles.start} aria-labelledby="start-title">
      <Nesa state={listening ? "ecoute" : "clin"} size={112} />
      <h1 id="start-title">Sur quelle notion tu bloques ?</h1>
      <p className={styles.lede}>
        Pose ta question à voix haute ou écris-la. Nesa t&apos;explique en dessinant au tableau, et tu peux l&apos;interrompre
        quand tu veux.
      </p>
      <QuestionInput
        size="large"
        placeholder="Ex. : comment je trouve les zéros d'une parabole ?"
        onSubmit={onAsk}
        onListeningChange={onListeningChange}
        submitLabel="Demander à Nesa"
        autoFocus
      />
      <div className={styles.suggestions}>
        <span>Pour essayer :</span>
        {SUGGESTED_QUESTIONS.map((question) => (
          <button key={question} type="button" onClick={() => onAsk(question)}>
            {question}
          </button>
        ))}
      </div>
      <p className={styles.sound}>Active le son : Nesa parle.</p>
    </section>
  );
}
