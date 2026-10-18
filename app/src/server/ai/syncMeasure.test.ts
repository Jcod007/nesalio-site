import { describe, expect, it } from "vitest";
import { measureSync, type SyncPorts } from "./syncMeasure";

describe("measureSync", () => {
  it("joue chaque phrase repérée, la transcrit et compare les deux prévisions", async () => {
    const said: string[] = [];
    const ports: SyncPorts = {
      synthesize: async (text) => {
        said.push(text);
        return { audio: new Uint8Array(), mediaType: "audio/wav", durationMs: 1000 };
      },
      transcribe: async () => ({
        text: "le point est ici",
        words: [
          { text: "Le", startMs: 0, endMs: 200 },
          { text: "point", startMs: 200, endMs: 500 },
          { text: "est", startMs: 500, endMs: 700 },
          { text: "ici", startMs: 700, endMs: 1000 },
        ],
        keys: ["text", "segments"],
      }),
    };
    const report = await measureSync(["Le point {A} est ici.", "Sans repère."], ports);
    expect(said).toEqual(["Le point est ici."]);
    expect(report.summary.count).toBe(1);
    expect(report.rows[0]).toMatchObject({ say: "Le point est ici.", id: "A", word: "point", actualMs: 500 });
  });

  it("signale une transcription sans horodatage au lieu d'inventer des chiffres", async () => {
    const ports: SyncPorts = {
      synthesize: async () => ({ audio: new Uint8Array(), mediaType: "audio/wav", durationMs: 1000 }),
      transcribe: async () => ({ text: "le point", words: [], keys: ["text"] }),
    };
    const report = await measureSync(["Le point {A} est ici."], ports);
    expect(report.summary.count).toBe(0);
    expect(report.problems[0]).toContain("aucun horodatage");
  });
});
