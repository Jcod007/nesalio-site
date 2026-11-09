import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/server/account", () => ({ requireAccount: async () => ({ ok: true, userId: "nesalio-test" }) }));
const answer = vi.hoisted(() => ({ text: "" }));
vi.mock("@/server/tutor/chatCompletions", () => ({
  streamChatCompletion: () => (async function* () { yield answer.text; })(),
}));
afterEach(() => vi.unstubAllEnvs());

const lesson = { lesson: { id: "l", title: "Titre", language: "fr", learning_goal: "But" } };
const slice = { slice: {
  slice_id: "s1", introduces: [{ id: "p", type: "point", params: { at: [0, 0] } }],
  beats: [{ id: "b", say: "Voici un point.", cues: [{ id: "c", text: "point" }], do: [{ id: "a", verb: "show", target: "p", at: "cue:c" }] }],
} };
const post = (body: unknown) => POST(new Request("http://localhost/api/nesalio", { method: "POST", body: JSON.stringify(body) }));

it("renvoie l’explication validée en flux NDJSON", async () => {
  vi.stubEnv("DISABLE_AI", "0");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test");
  answer.text = `${JSON.stringify(lesson)}\n${JSON.stringify(slice)}\n`;
  const response = await post({ question: "Explique-moi un point" });
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
  const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
  expect(lines.map((line) => line.kind)).toEqual(["lesson", "slice", "end"]);
  expect(lines[1].slice.slice_id).toBe("s1");
});

it("refuse une question vide et signale un modèle non configuré", async () => {
  vi.stubEnv("DISABLE_AI", "0");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test");
  expect((await post({ question: "  " })).status).toBe(400);
  vi.stubEnv("DISABLE_AI", "1");
  const response = await post({ question: "Explique-moi un point" });
  expect(response.status).toBe(503);
  expect(JSON.parse(await response.text())).toMatchObject({ kind: "error", code: "upstream" });
});
