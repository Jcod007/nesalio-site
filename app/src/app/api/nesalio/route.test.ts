import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/server/account", () => ({ requireAccount: async () => ({ ok: true, userId: "nesalio-test" }) }));
const answer = vi.hoisted(() => ({ text: "" }));
vi.mock("@/server/tutor/chatCompletions", () => ({
  streamChatCompletion: () =>
    (async function* () {
      yield answer.text;
    })(),
}));
// `after` runs once the response is sent; here, when the test calls the queued tasks.
const afterTasks = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", () => ({
  after: (task: () => unknown) => {
    afterTasks.push(task);
  },
}));
const saved = vi.hoisted(() => [] as unknown[]);
vi.mock("@/server/sessionStore", () => ({
  recordEnv: () => "production",
  saveTurn: async (record: unknown) => {
    saved.push(record);
    return true;
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  afterTasks.length = 0;
  saved.length = 0;
});

const lesson = { lesson: { id: "l", title: "Titre", language: "fr", learning_goal: "But" } };
const slice = {
  slice: {
    slice_id: "s1",
    introduces: [{ id: "p", type: "point", params: { at: [0, 0] } }],
    beats: [{ id: "b", say: "Voici un point.", cues: [{ id: "c", text: "point" }], do: [{ id: "a", verb: "show", target: "p", at: "cue:c" }] }],
  },
};
const post = (body: unknown) => POST(new Request("http://localhost/api/nesalio", { method: "POST", body: JSON.stringify(body) }));

it("renvoie l’explication validée en flux NDJSON", async () => {
  vi.stubEnv("DISABLE_AI", "0");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test");
  answer.text = `${JSON.stringify(lesson)}\n${JSON.stringify(slice)}\n`;
  const response = await post({ question: "Explique-moi un point" });
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
  const lines = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(lines.map((line) => line.kind)).toEqual(["lesson", "slice", "end"]);
  expect(lines[1].slice.slice_id).toBe("s1");
  // The lesson is recorded after the response, with exactly what the student received.
  expect(saved).toHaveLength(0);
  for (const task of afterTasks) await task();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ kind: "nesalio", question: "Explique-moi un point", outcome: "complete" });
  expect((saved[0] as { events: Array<{ kind: string }> }).events.map((e) => e.kind)).toEqual(["lesson", "slice", "end"]);
}, 20_000); // cold start of the generator can exceed the default 5 s

it("refuse une question vide et signale un modèle non configuré", async () => {
  vi.stubEnv("DISABLE_AI", "0");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test");
  expect((await post({ question: "  " })).status).toBe(400);
  vi.stubEnv("DISABLE_AI", "1");
  const response = await post({ question: "Explique-moi un point" });
  expect(response.status).toBe(503);
  expect(JSON.parse(await response.text())).toMatchObject({ kind: "error", code: "upstream" });
});
