import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_HEADER } from "@/domain/session";
import { POST } from "./route";

const request = (body: unknown, session = "abcdef12-3456") =>
  new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", [SESSION_HEADER]: session, "x-forwarded-for": "10.1.1.1" },
    body: JSON.stringify(body),
  });

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/feedback", () => {
  it("transmet le retour au formulaire, trié comme « retour-outil », avec la séance jointe", async () => {
    const sent: Array<Record<string, string>> = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    });
    const response = await POST(
      request({
        kind: "bug",
        message: "Le cercle est décalé",
        email: "",
        context: { question: "Fourier ?", title: "Fourier", status: "playing", recent: ["Voici le cercle."], board: ["c · circle · centre (0, 0)"], screen: "1280×760", browser: "test" },
      }),
    );
    expect(response.status).toBe(200);
    expect(sent[0]).toMatchObject({ etape: "retour-outil", message: "Le cercle est décalé", question: "Fourier ?", session: "abcdef12" });
    expect(sent[0]!.dernieres_phrases).toBe("Voici le cercle.");
  });

  it("refuse un message vide et signale un formulaire injoignable", async () => {
    expect((await POST(request({ kind: "idee", message: " " }))).status).toBe(400);
    vi.stubGlobal("fetch", async () => new Response("non", { status: 500 }));
    expect((await POST(request({ kind: "idee", message: "Une idée", email: "toi@exemple.com" }, "zzzzzzzz-1")))).toHaveProperty("status", 502);
  });
});
