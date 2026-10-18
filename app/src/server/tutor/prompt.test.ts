import { describe, expect, it } from "vitest";
import { emptyBoard } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import { ModelEvent } from "@/domain/scene/schema";
import { buildSystemPrompt } from "./prompt";

describe("consigne du modèle", () => {
  it("ne montre que des exemples valides, qui produisent bien le geste annoncé", () => {
    const lines = buildSystemPrompt()
      .split("\n")
      .filter((line) => line.startsWith('{"kind":'));
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) expect(ModelEvent.safeParse(JSON.parse(line)).success, line).toBe(true);

    // L'exemple de geste : la copie de w finit au bout de v.
    const gesture = lines.filter((line) => line.includes('"w2"') || line.includes('"id":"v"'));
    let board = emptyBoard();
    for (const line of gesture) {
      const event = ModelEvent.parse(JSON.parse(line));
      if (event.kind !== "step") continue;
      for (const action of event.do ?? []) board = applyAction(board, action, { start: 0, duration: 0 });
    }
    expect(board.nodes.w2?.offset).toEqual([1, 2]);
  });
});
