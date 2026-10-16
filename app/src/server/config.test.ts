import { describe, expect, it } from "vitest";
import { DEFAULTS, readAiConfig } from "./config";

const headers = (token?: string) => new Headers(token ? { "x-vercel-oidc-token": token } : {});

describe("readAiConfig", () => {
  it("utilise AI Gateway avec le jeton OIDC de la requête", () => {
    const config = readAiConfig(headers("oidc"), {} as NodeJS.ProcessEnv);
    expect(config.chat).toMatchObject({ name: "gateway", apiKey: "oidc", model: DEFAULTS.gatewayModel });
    expect(config.gatewayToken).toBe("oidc");
  });

  it("préfère OpenRouter pour le modèle quand sa clé est fournie, et garde la voix sur AI Gateway", () => {
    const config = readAiConfig(headers("oidc"), { OPENROUTER_API_KEY: "or", TUTOR_MODEL: "x/y" } as unknown as NodeJS.ProcessEnv);
    expect(config.chat).toMatchObject({ name: "openrouter", apiKey: "or", model: "x/y" });
    expect(config.gatewayToken).toBe("oidc");
  });

  it("utilise Claude directement en priorité quand ANTHROPIC_API_KEY est fournie", () => {
    const config = readAiConfig(headers("oidc"), { ANTHROPIC_API_KEY: "sk", OPENROUTER_API_KEY: "or" } as unknown as NodeJS.ProcessEnv);
    expect(config.chat).toMatchObject({ name: "anthropic", protocol: "anthropic", apiKey: "sk", model: DEFAULTS.anthropicModel });
  });

  it("passe en démonstration sans aucun identifiant, ou si l'IA est désactivée", () => {
    expect(readAiConfig(headers(), {} as NodeJS.ProcessEnv)).toMatchObject({ chat: null, gatewayToken: null });
    expect(readAiConfig(headers("oidc"), { DISABLE_AI: "1" } as unknown as NodeJS.ProcessEnv)).toMatchObject({
      chat: null,
      gatewayToken: null,
    });
  });
});
