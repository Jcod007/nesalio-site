import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardToForm, NO_EMAIL, withEmail } from "./forms";

afterEach(() => vi.unstubAllGlobals());

describe("forwardToForm", () => {
  it("ajoute toujours un champ email : Formspree refuse (422) un envoi sans courriel", async () => {
    const sent: Array<Record<string, string>> = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, string>;
      sent.push(body);
      // Comportement réel du formulaire : courriel obligatoire.
      return body.email ? new Response("{}", { status: 200 }) : new Response('{"error":"Validation errors"}', { status: 422 });
    });
    expect(await forwardToForm({ etape: "3-apres-essai", aurait_aide: "Un peu" })).toBe(true);
    expect(sent[0]).toMatchObject({ etape: "3-apres-essai", email: NO_EMAIL });
  });

  it("garde le courriel donné par la personne", () => {
    expect(withEmail({ email: "toi@exemple.com" }).email).toBe("toi@exemple.com");
    expect(withEmail({ email: "  " }).email).toBe(NO_EMAIL);
  });
});
