/** Configuration serveur, lue une seule fois depuis les variables d'environnement. */
export interface ServerConfig {
  openRouterApiKey?: string;
  model: string;
  appUrl?: string;
}

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    openRouterApiKey: env.OPENROUTER_API_KEY?.trim() || undefined,
    model: env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
    appUrl: env.NEXT_PUBLIC_APP_URL?.trim() || undefined,
  };
}
