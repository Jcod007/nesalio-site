import { describe, expect, it } from "vitest";
import { nesalioAvailable } from "./explainer";

const ai = { AI_GATEWAY_API_KEY: "cle" } as unknown as NodeJS.ProcessEnv;
const headers = new Headers();

describe("Nesalio sur la page élève", () => {
  it("explique dès qu'un modèle est configuré", () => {
    expect(nesalioAvailable({ env: ai, headers })).toBe(true);
  });

  it("n'est pas disponible sans modèle (l'ancien tuteur a été retiré)", () => {
    expect(nesalioAvailable({ env: { ...ai, DISABLE_AI: "1" }, headers })).toBe(false);
    expect(nesalioAvailable({ env: {} as NodeJS.ProcessEnv, headers })).toBe(false);
  });
});
