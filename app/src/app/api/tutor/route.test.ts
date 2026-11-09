import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/account", () => ({ requireAccount: async (request: Request) => ({ ok: true, userId: request.headers.get("x-nesalio-session") }) }));
vi.mock("@/server/config", () => ({ readAiConfig: vi.fn(() => ({ chat: null })) }));
vi.mock("@/server/tutor/chatCompletions", async (original) => ({
  ...await original<typeof import("@/server/tutor/chatCompletions")>(),
  streamChatCompletion: vi.fn(),
}));
vi.mock("@/server/sessionStore", () => ({ recordEnv: () => "development", saveTurn: vi.fn() }));

import { POST } from "./route";
import { INSPECTION_HEADER } from "@/domain/tutor/inspection";
import { readAiConfig } from "@/server/config";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";

afterEach(() => vi.unstubAllEnvs());

const request = (body: string, session = crypto.randomUUID()) => new Request("http://localhost/api/tutor", {
  method: "POST", headers: { "Content-Type": "application/json", "x-nesalio-session": session }, body,
});

describe("POST /api/tutor", () => {
  it("associe l'objet brut à l'étape traitée uniquement en inspection locale", async () => {
    const original = '{"kind":"step","segments":[{"say":"Voici un point.","do":[{"type":"point","id":"A","x":2,"y":3}]}]';
    const completion: typeof streamChatCompletion = async function* () {
      yield original + '\n{"kind":"end","summary":[]}';
    };
    for (const [env, host, inspect, expected] of [
      ["development", "localhost", true, true],
      ["development", "localhost", false, false],
      ["development", "example.test", true, false],
      ["production", "localhost", true, false],
    ] as const) {
      vi.stubEnv("NODE_ENV", env);
      vi.stubEnv("VERCEL", undefined);
      vi.mocked(readAiConfig).mockReturnValueOnce({ chat: { name: "gateway", protocol: "openai", endpoint: "https://example.test", apiKey: "test", model: "test" } } as ReturnType<typeof readAiConfig>);
      vi.mocked(streamChatCompletion).mockImplementationOnce(completion);
      const response = await POST(new Request(`http://${host}/api/tutor`, {
        method: "POST",
        headers: { "x-nesalio-session": crypto.randomUUID(), ...(inspect ? { [INSPECTION_HEADER]: "1" } : {}) },
        body: JSON.stringify({ mode: "question", question: "Explique les coordonnées sans quiz." }),
      }));
      const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
      const index = events.findIndex((event) => event.kind === "step");
      expect(events[index]).toMatchObject({ segments: [{ do: [{ type: "point", id: "A", at: [2, 3] }] }] });
      if (expected) expect(events[index - 1]).toEqual({ kind: "trace-step", raw: original });
      else expect(events.some((event) => event.kind === "trace-step")).toBe(false);
    }
  });

  it("conserve le flux NDJSON de démonstration et ses en-têtes", async () => {
    const response = await POST(request(JSON.stringify({ mode: "question", question: "Les zéros d'une parabole" })));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(events[0]).toEqual({ kind: "source", source: "demo" });
    expect(events.at(-1).kind).toBe("end");
  });

  it("renvoie uniquement des étapes segmentées, même si un ancien client demande Legacy", async () => {
    const question = "Les zéros d'une parabole";
    for (const body of [{ mode: "question", question }, { mode: "question", question, stepFormat: "legacy" }, { mode: "followUp", question }]) {
      const response = await POST(request(JSON.stringify(body)));
      expect(response.status).toBe(200);
      const steps = (await response.text()).trim().split("\n")
        .map((line) => JSON.parse(line)).filter((event) => event.kind === "step");
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.segments.length).toBeGreaterThan(0);
        expect(step).not.toHaveProperty("say");
        expect(step).not.toHaveProperty("do");
        expect(step).not.toHaveProperty("cues");
      }
    }
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
