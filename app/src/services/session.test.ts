import { describe, expect, it, vi } from "vitest";
import { isSessionId, SESSION_HEADER } from "@/domain/session";

describe("session de la page", () => {
  it("reste la même pendant la visite, et change quand la page est rechargée", async () => {
    const first = await import("./session");
    const id = first.sessionId();
    expect(isSessionId(id)).toBe(true);
    expect(first.sessionHeaders()).toEqual({ [SESSION_HEADER]: id });
    expect(first.sessionId()).toBe(id);
    vi.resetModules(); // équivalent d'un rechargement : le module repart de zéro
    const reloaded = await import("./session");
    expect(reloaded.sessionId()).not.toBe(id);
  });
});
