import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/config", () => ({ readAiConfig: () => ({ chat: null }) }));
vi.mock("@/server/sessionStore", () => ({ recordEnv: () => "development", saveTurn: vi.fn() }));

import { POST } from "./route";

const request = (body: string, session = crypto.randomUUID()) => new Request("http://localhost/api/tutor", {
  method: "POST", headers: { "Content-Type": "application/json", "x-nesalio-session": session }, body,
});

describe("POST /api/tutor", () => {
  it("conserve le flux NDJSON de démonstration et ses en-têtes", async () => {
    const response = await POST(request(JSON.stringify({ mode: "question", question: "Les zéros d'une parabole" })));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events[0]).toEqual({ kind: "source", source: "demo" });
    expect(events.at(-1).kind).toBe("end");
  });

  it("refuse les corps invalides et les métadonnées hors limites", async () => {
    for (const body of ["{", JSON.stringify({ mode: "question", question: "?", context: { spoken: [], board: [], learning: {
      v: 1, concepts: [{ id: "test", presented: [], observations: [{ task: "?", outcome: "correct", format: "choice", support: "independent", at: -1 }] }],
    } } })]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(JSON.parse((await response.text()).trim())).toMatchObject({ kind: "error", code: "bad_request" });
    }
  });

  it("refuse un corps Unicode de plus de 96 000 octets avant sa validation", async () => {
    const response = await POST(request(JSON.stringify({ mode: "question", question: "é".repeat(48_001) })));
    expect(response.status).toBe(413);
  });

  it("compte les requêtes invalides et limite avant de lire un nouveau corps", async () => {
    const session = crypto.randomUUID();
    for (let index = 0; index < 40; index++) expect((await POST(request("{}", session))).status).toBe(400);
    const blocked = request("{}", session);
    const response = await POST(blocked);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(blocked.bodyUsed).toBe(false);
  });
});
