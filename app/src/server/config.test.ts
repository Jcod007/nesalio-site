import { describe, expect, it } from "vitest";
import { DEFAULTS, readAiConfig } from "./config";

const headers = (token?: string) => new Headers(token ? { "x-vercel-oidc-token": token } : {});

describe("readAiConfig", () => {
  it("utilise AI Gateway avec le jeton OIDC de la requête", () => {
    const config = readAiConfig(headers("oidc"), {} as unknown as NodeJS.ProcessEnv);
    expect(config.chat).toMatchObject({ name: "gateway", apiKey: "oidc", model: DEFAULTS.gatewayModel });
    expect(config.gatewayToken).toBe("oidc");
  });

  it("préfère OpenRouter pour le modèle quand sa clé est fournie, et garde la voix sur AI Gateway", () => {
    const config = readAiConfig(headers("oidc"), { OPENROUTER_API_KEY: "or", TUTOR_MODEL: "x/y" } as unknown as unknown as NodeJS.ProcessEnv);
    expect(config.chat).toMatchObject({ name: "openrouter", apiKey: "or", model: "x/y" });
    expect(config.gatewayToken).toBe("oidc");
  });

  it("utilise Claude directement en priorité quand ANTHROPIC_API_KEY est fournie", () => {
    const config = readAiConfig(headers("oidc"), { ANTHROPIC_API_KEY: "sk", OPENROUTER_API_KEY: "or" } as unknown as unknown as NodeJS.ProcessEnv);
    expect(config.chat).toMatchObject({ name: "anthropic", protocol: "anthropic", apiKey: "sk", model: DEFAULTS.anthropicModel });
  });

  it("passe en démonstration sans aucun identifiant, ou si l'IA est désactivée", () => {
    expect(readAiConfig(headers(), {} as unknown as NodeJS.ProcessEnv)).toMatchObject({ chat: null, gatewayToken: null });
    expect(readAiConfig(headers("oidc"), { DISABLE_AI: "1" } as unknown as unknown as NodeJS.ProcessEnv)).toMatchObject({
      chat: null,
      gatewayToken: null,
    });
  });
});

describe("réflexion des tours de suite", () => {
  it("prépare un exemple calculé dès le premier tour et respecte un réglage explicite", () => {
    expect(readAiConfig(headers("oidc"), {} as NodeJS.ProcessEnv).chat?.firstTurnEffort).toBe("low");
    expect(readAiConfig(headers("oidc"), { TUTOR_FIRST_TURN_EFFORT: "none" } as unknown as NodeJS.ProcessEnv).chat?.firstTurnEffort).toBe("none");
  });
  it("dépend du modèle sans réglage explicite : aucune pour Claude, courte pour les autres", async () => {
    const { readAiConfig } = await import("./config");
    const headers = new Headers({ "x-vercel-oidc-token": "jeton" });
    expect(readAiConfig(headers, { TUTOR_MODEL: "anthropic/claude-sonnet-5.5" } as unknown as NodeJS.ProcessEnv).chat?.reasoningEffort).toBe("none");
    expect(readAiConfig(headers, { TUTOR_MODEL: "deepseek/deepseek-v4.1-flash" } as unknown as NodeJS.ProcessEnv).chat?.reasoningEffort).toBe("low");
    expect(readAiConfig(headers, { TUTOR_MODEL: "deepseek/deepseek-v4.1-flash", TUTOR_REASONING_EFFORT: "none" } as unknown as NodeJS.ProcessEnv).chat?.reasoningEffort).toBe("none");
  });
});
