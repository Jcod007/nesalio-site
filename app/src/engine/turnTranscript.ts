/**
 * Enregistrement de ce qui est arrivé du serveur, tour par tour (les
 * événements tels quels). Joint à un signalement de problème, il permet de
 * rejouer exactement la séance de la personne.
 */
import type { StreamEvent } from "@/domain/scene/schema";

/** Tours gardés pour rejouer une séance signalée, et taille maximale de l'enregistrement joint. */
const MAX_RECORDED_TURNS = 6;
const MAX_REPLAY_CHARS = 16_000;

export class TurnTranscript {
  private turns: StreamEvent[][] = [];

  /** Ouvre un nouveau tour et renvoie la liste où ranger ses événements. */
  startTurn(): StreamEvent[] {
    const turn: StreamEvent[] = [];
    this.turns = [...this.turns, turn].slice(-MAX_RECORDED_TURNS);
    return turn;
  }

  clear(): void {
    this.turns = [];
  }

  /**
   * Les tours en JSON. Les plus récents sont gardés : on retire les plus
   * anciens tant que c'est trop long. Chaîne vide si un seul tour dépasse déjà.
   */
  serialize(): string {
    let turns = this.turns;
    let replay = JSON.stringify(turns);
    while (replay.length > MAX_REPLAY_CHARS && turns.length > 1) {
      turns = turns.slice(1);
      replay = JSON.stringify(turns);
    }
    return replay.length > MAX_REPLAY_CHARS ? "" : replay;
  }
}
