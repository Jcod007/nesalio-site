import { describe, expect, it } from "vitest";
import type { TurnRecord } from "@/domain/sessionLog";
import { listTurns, purgeOld, saveTurn, type BlobPort } from "./sessionStore";

const record: TurnRecord = {
  v: 1,
  env: "production",
  session: "3f9c2e1a-7b44-4c1d-9e0f-aa11bb22cc33",
  at: "2026-10-18T14:12:05.123Z",
  mode: "question",
  question: "C'est quoi une somme ?",
  source: "model",
  latencyMs: { total: 900 },
  outcome: "complete",
  events: [{ kind: "step", say: "Voici 3 pommes.", do: [] }],
};

/** Magasin en mémoire qui imite Vercel Blob (privé). */
function memoryBlob(): BlobPort & { files: Map<string, { body: string; uploadedAt: Date; access: string }> } {
  const files = new Map<string, { body: string; uploadedAt: Date; access: string }>();
  return {
    files,
    async put(pathname, body, options) {
      files.set(pathname, { body, uploadedAt: new Date("2026-10-18T14:12:06Z"), access: options.access });
    },
    async list(prefix) {
      return [...files.entries()].filter(([p]) => p.startsWith(prefix)).map(([pathname, f]) => ({ pathname, uploadedAt: f.uploadedAt }));
    },
    async read(pathname) {
      return files.get(pathname)?.body ?? null;
    },
    async del(pathnames) {
      for (const p of pathnames) files.delete(p);
    },
  };
}

describe("saveTurn", () => {
  it("écrit le tour en privé, à son chemin", async () => {
    const blob = memoryBlob();
    expect(await saveTurn(record, blob)).toBe(true);
    const file = blob.files.get("production/2026-10-18/3f9c2e1a/141205123-question.json")!;
    expect(file.access).toBe("private");
    expect(JSON.parse(file.body)).toEqual(record);
  });

  it("n'interrompt jamais la séance si le stockage échoue", async () => {
    const blob = { ...memoryBlob(), put: async () => { throw new Error("stockage indisponible"); } };
    expect(await saveTurn(record, blob)).toBe(false);
  });

  it("n'écrit rien quand l'enregistrement est désactivé", async () => {
    expect(await saveTurn(record, null)).toBe(false);
  });
});

describe("listTurns", () => {
  it("rend les tours d'un jour, dans l'ordre, et filtre par session courte", async () => {
    const blob = memoryBlob();
    await saveTurn({ ...record, at: "2026-10-18T14:13:00.000Z", mode: "continue" }, blob);
    await saveTurn(record, blob);
    await saveTurn({ ...record, session: "aaaaaaaa-0000-0000-0000-000000000000" }, blob);
    const all = await listTurns({ env: "production", day: "2026-10-18" }, blob);
    expect(all).toHaveLength(3);
    const mine = await listTurns({ env: "production", day: "2026-10-18", session: "3f9c2e1a" }, blob);
    expect(mine.map((t) => t.mode)).toEqual(["question", "continue"]);
  });
});

describe("purgeOld", () => {
  it("supprime seulement ce qui dépasse la durée de conservation", async () => {
    const blob = memoryBlob();
    await saveTurn(record, blob);
    blob.files.set("production/2025-01-01/old/000000000-question.json", { body: "{}", uploadedAt: new Date("2025-01-01T00:00:00Z"), access: "private" });
    const deleted = await purgeOld(new Date("2026-10-18T15:00:00Z"), blob);
    expect(deleted).toBe(1);
    expect([...blob.files.keys()]).toEqual(["production/2026-10-18/3f9c2e1a/141205123-question.json"]);
  });
});
