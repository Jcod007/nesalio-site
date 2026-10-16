/**
 * Micro : reconnaissance vocale du navigateur (Chrome, Edge, Safari).
 * Si elle n'existe pas (Firefox), l'interface masque simplement le bouton.
 */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

export interface ListenHandlers {
  /** Texte entendu jusqu'ici (mis à jour en continu). */
  onText(text: string, final: boolean): void;
  onEnd(): void;
  onError?(code: string): void;
}

export interface SpeechListener {
  readonly supported: boolean;
  start(handlers: ListenHandlers): void;
  stop(): void;
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function createSpeechListener(lang = "fr-CA"): SpeechListener {
  const Ctor = recognitionCtor();
  let current: Recognition | null = null;

  return {
    supported: Ctor !== null,
    start(handlers) {
      if (!Ctor) return;
      current?.abort();
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.continuous = false;
      let finalText = "";
      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]!;
          if (result.isFinal) finalText += result[0].transcript;
          else interim += result[0].transcript;
        }
        handlers.onText((finalText + interim).trim(), interim === "");
      };
      recognition.onerror = (event) => handlers.onError?.(event.error);
      recognition.onend = () => {
        if (current === recognition) current = null;
        handlers.onEnd();
      };
      current = recognition;
      recognition.start();
    },
    stop() {
      current?.stop();
    },
  };
}
