import { describe, expect, it } from "vitest";
import type { StreamEvent } from "@/domain/scene/schema";
import { TurnTranscript } from "./turnTranscript";

const error = (message: string): StreamEvent => ({ kind: "error", code: "upstream", message });

describe("TurnTranscript", () => {
  it("enregistre les événements de chaque tour, dans l'ordre", () => {
    const transcript = new TurnTranscript();
    transcript.startTurn().push(error("a"));
    transcript.startTurn().push(error("b"), error("c"));
    expect(JSON.parse(transcript.serialize())).toEqual([[error("a")], [error("b"), error("c")]]);
  });

  it("ne garde que les 6 derniers tours", () => {
    const transcript = new TurnTranscript();
    for (let i = 0; i < 8; i++) transcript.startTurn().push(error(String(i)));
    const turns = JSON.parse(transcript.serialize()) as StreamEvent[][];
    expect(turns).toHaveLength(6);
    expect(turns[0]).toEqual([error("2")]);
  });

  it("retire les plus anciens tours quand c'est trop long, et renvoie vide si un seul tour dépasse", () => {
    const transcript = new TurnTranscript();
    transcript.startTurn().push(error("x".repeat(10_000)));
    transcript.startTurn().push(error("y".repeat(10_000)));
    expect(JSON.parse(transcript.serialize())).toEqual([[error("y".repeat(10_000))]]);
    transcript.startTurn().push(error("z".repeat(20_000)));
    expect(transcript.serialize()).toBe("");
  });

  it("clear vide l'enregistrement", () => {
    const transcript = new TurnTranscript();
    transcript.startTurn().push(error("a"));
    transcript.clear();
    expect(transcript.serialize()).toBe("[]");
  });
});
