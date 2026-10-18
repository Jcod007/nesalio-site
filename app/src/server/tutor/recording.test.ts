import { describe, expect, it } from "vitest";
import type { StreamEvent } from "@/domain/scene/schema";
import type { TurnOutcome } from "@/domain/sessionLog";
import { withRecording } from "./recording";

function spy() {
  const seen: StreamEvent[] = [];
  let outcome: TurnOutcome | null = null;
  return {
    seen,
    get outcome() {
      return outcome;
    },
    event: (e: StreamEvent) => void seen.push(e),
    finish: (o: TurnOutcome) => void (outcome ??= o),
  };
}

async function* source(events: StreamEvent[], fail = false): AsyncGenerator<StreamEvent> {
  for (const event of events) yield event;
  if (fail) throw new Error("modèle coupé");
}

const step = (say: string): StreamEvent => ({ kind: "step", say, do: [] });

describe("withRecording", () => {
  it("transmet chaque événement tel quel et note un tour complet", async () => {
    const rec = spy();
    const out: StreamEvent[] = [];
    for await (const e of withRecording(source([step("a"), { kind: "end", summary: [] }]), rec)) out.push(e);
    expect(out).toEqual(rec.seen);
    expect(rec.outcome).toBe("complete");
  });

  it("note une erreur si le flux casse", async () => {
    const rec = spy();
    await expect(async () => {
      for await (const _ of withRecording(source([step("a")], true), rec)) void _;
    }).rejects.toThrow("modèle coupé");
    expect(rec.outcome).toBe("error");
    expect(rec.seen).toHaveLength(1);
  });

  it("note un tour interrompu quand l'élève coupe avant la fin", async () => {
    const rec = spy();
    const events = withRecording(source([step("a"), step("b"), step("c")]), rec);
    await events.next();
    await events.return(undefined);
    expect(rec.outcome).toBe("cancelled");
    expect(rec.seen.map((e) => (e.kind === "step" ? e.say : e.kind))).toEqual(["a"]);
  });
});
