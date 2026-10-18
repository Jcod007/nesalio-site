import { describe, expect, it, vi } from "vitest";
import { isSessionId, REF_HEADER, SESSION_HEADER } from "@/domain/session";

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

  it("joint la référence d'inscription lue dans l'adresse, et seulement si elle est valide", async () => {
    vi.resetModules();
    const page = await import("./session");
    expect(page.signupRef("?src=formulaire&ref=k3x9a1b2c3d4")).toBe("k3x9a1b2c3d4");
    expect(page.sessionHeaders()[REF_HEADER]).toBe("k3x9a1b2c3d4");
    vi.resetModules();
    const other = await import("./session");
    expect(other.signupRef("?ref=<script>")).toBeNull();
    expect(other.sessionHeaders()).not.toHaveProperty(REF_HEADER);
  });
});
