/**
 * Configuration serveur : quels services d'IA sont disponibles, et avec
 * quels identifiants.
 *
 * Par défaut, tout passe par Vercel AI Gateway, authentifié par le jeton OIDC
 * que Vercel fournit à chaque requête : aucune clé à gérer. OpenRouter reste
 * possible pour le modèle (OPENROUTER_API_KEY). Sans aucun des deux, Nesa
 * joue les séances de démonstration et utilise la voix du navigateur.
 */

export const GATEWAY_BASE = "https://ai-gateway.vercel.sh";

export interface ChatProvider {
  name: "gateway" | "openrouter";
  endpoint: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

export interface AiConfig {
  chat: ChatProvider | null;
  /** Jeton pour les voix et la transcription (AI Gateway). */
  gatewayToken: string | null;
  voice: { model: string; voice: string; instructions: string };
  transcription: { model: string };
}

export const DEFAULTS = {
  gatewayModel: "anthropic/claude-sonnet-5.5",
  openRouterModel: "anthropic/claude-sonnet-4.5",
  voiceModel: "google/gemini-3.8-flash-lite-tts",
  voiceName: "Kore",
  voiceInstructions:
    "Tu es Nesa, une tutrice québécoise chaleureuse qui explique au tableau à un élève de secondaire. " +
    "Parle en français avec un accent québécois léger, un ton naturel, vivant et encourageant, " +
    "à un rythme posé, avec de petites pauses aux virgules. Jamais monotone.",
  transcriptionModel: "openai/whisper-1",
} as const;

/** Lit la configuration pour une requête (le jeton OIDC arrive dans ses en-têtes). */
export function readAiConfig(headers: Headers, env: NodeJS.ProcessEnv = process.env): AiConfig {
  const gatewayToken =
    env.AI_GATEWAY_API_KEY?.trim() || headers.get("x-vercel-oidc-token") || env.VERCEL_OIDC_TOKEN?.trim() || null;
  const openRouterKey = env.OPENROUTER_API_KEY?.trim();
  const modelOverride = env.TUTOR_MODEL?.trim() || env.OPENROUTER_MODEL?.trim();

  let chat: ChatProvider | null = null;
  if (openRouterKey) {
    chat = {
      name: "openrouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openRouterKey,
      model: modelOverride || DEFAULTS.openRouterModel,
      extraHeaders: { "X-Title": "Nesalio", ...(env.NEXT_PUBLIC_APP_URL ? { "HTTP-Referer": env.NEXT_PUBLIC_APP_URL } : {}) },
    };
  } else if (gatewayToken && env.DISABLE_AI !== "1") {
    chat = {
      name: "gateway",
      endpoint: `${GATEWAY_BASE}/v1/chat/completions`,
      apiKey: gatewayToken,
      model: modelOverride || DEFAULTS.gatewayModel,
    };
  }

  return {
    chat,
    gatewayToken: env.DISABLE_AI === "1" ? null : gatewayToken,
    voice: {
      model: env.VOICE_MODEL?.trim() || DEFAULTS.voiceModel,
      voice: env.VOICE_NAME?.trim() || DEFAULTS.voiceName,
      instructions: env.VOICE_INSTRUCTIONS?.trim() || DEFAULTS.voiceInstructions,
    },
    transcription: { model: env.TRANSCRIPTION_MODEL?.trim() || DEFAULTS.transcriptionModel },
  };
}
