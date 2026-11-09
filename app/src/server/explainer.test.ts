import { describe, expect, it } from "vitest";
import { explainerFor } from "./explainer";

const ai = { AI_GATEWAY_API_KEY: "cle" } as unknown as NodeJS.ProcessEnv;
const headers = new Headers();

describe("choix du système d'explication de la page élève", () => {
  it("prend Nesalio par défaut quand le modèle est configuré", () => {
    expect(explainerFor({ env: ai, headers, inspection: false })).toBe("nesalio");
  });

  it("revient à l'ancien système par le réglage, sans toucher au code", () => {
    expect(explainerFor({ env: { ...ai, NESALIO_EXPLICATION: "0" }, headers, inspection: false })).toBe("tuteur");
  });

  it("garde l'ancien système sans IA (leçons de démonstration) et pour l'inspection JSON", () => {
    expect(explainerFor({ env: { ...ai, DISABLE_AI: "1" }, headers, inspection: false })).toBe("tuteur");
    expect(explainerFor({ env: {} as NodeJS.ProcessEnv, headers, inspection: false })).toBe("tuteur");
    expect(explainerFor({ env: ai, headers, inspection: true })).toBe("tuteur");
  });
});
