/**
 * Passe le flux d'une séance à l'enregistreur (domain/sessionLog.ts) sans le
 * modifier : chaque événement envoyé à l'élève est noté, puis l'issue du tour
 * (complet, interrompu par l'élève, ou coupé par une erreur).
 */
import type { StreamEvent } from "@/domain/scene/schema";
import type { TurnOutcome } from "@/domain/sessionLog";

interface Recorder {
  event(event: StreamEvent): void;
  finish(outcome: TurnOutcome): void;
}

export async function* withRecording(events: AsyncGenerator<StreamEvent>, recorder: Recorder): AsyncGenerator<StreamEvent> {
  let finished = false;
  try {
    for await (const event of events) {
      recorder.event(event);
      yield event;
    }
    recorder.finish("complete");
    finished = true;
  } catch (error) {
    recorder.finish("error");
    finished = true;
    throw error;
  } finally {
    // Sortie anticipée (return() : l'élève a coupé ou fermé la page).
    if (!finished) recorder.finish("cancelled");
  }
}
