/**
 * Configuration serveur : quels services d'IA sont disponibles, et avec
 * quels identifiants.
 *
 * Modèle, par ordre de priorité :
 *   1. Claude directement (ANTHROPIC_API_KEY, console Claude) ;
 *   2. OpenRouter (OPENROUTER_API_KEY) ;
 *   3. Vercel AI Gateway, authentifié par le jeton OIDC de Vercel.
 * Voix et transcription : Vercel AI Gateway. Sans rien de tout ça, Nesa joue
 * les séances de démonstration avec la voix et le micro du navigateur.
 */

import { REASONING_EFFORTS, type ReasoningEffort } from "@/server/tutor/chatCompletions";

export const GATEWAY_BASE = "https://ai-gateway.vercel.sh";

export interface ChatProvider {
  name: "anthropic" | "gateway" | "openrouter";
  protocol: "openai" | "anthropic";
  endpoint: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  reasoningEffort?: ReasoningEffort;
}

export interface AiConfig {
  chat: ChatProvider | null;
  /** Jeton pour les voix et la transcription (AI Gateway). */
  gatewayToken: string | null;
  voice: { model: string; voice: string; instructions: string };
  transcription: { model: string };
}

export const DEFAULTS = {
  anthropicModel: "claude-sonnet-5-5",
  // DeepSeek V4.1 Flash : séances justes pour environ 20 fois moins cher que Claude Sonnet 5.5
  // (testé en ligne le 17 octobre 2026). Pour revenir à Claude : TUTOR_MODEL=anthropic/claude-sonnet-5.5
  gatewayModel: "deepseek/deepseek-v4.1-flash",
  openRouterModel: "anthropic/claude-sonnet-4.5",
  voiceModel: "google/gemini-3.8-flash-lite-tts",
  voiceName: "Kore",
  voiceInstructions:
    "Tu es Nesa, une tutrice québécoise chaleureuse qui explique au tableau à un élève de secondaire. " +
    "Parle en français avec un accent québécois léger, un ton naturel, vivant et encourageant, " +
    "à un rythme posé, avec de petites pauses aux virgules. Jamais monotone.",
  transcriptionModel: "openai/whisper-1",
  /**
   * Sans réflexion préalable : première phrase en moins d'une seconde avec DeepSeek V4.1 Flash,
   * contre environ 12 s par défaut (mesuré en ligne le 17 octobre 2026, calculs restés justes).
   * Mettre TUTOR_REASONING_EFFORT=low si les explications perdent en justesse.
   */
  reasoningEffort: "none" as ReasoningEffort,
} as const;

export function parseEffort(value: string | null | undefined): ReasoningEffort | undefined {
  const effort = value?.trim() as ReasoningEffort | undefined;
  return effort && REASONING_EFFORTS.includes(effort) ? effort : undefined;
}

/** Lit la configuration pour une requête (le jeton OIDC arrive dans ses en-têtes). */
export function readAiConfig(headers: Headers, env: NodeJS.ProcessEnv = process.env): AiConfig {
  const gatewayToken =
    env.AI_GATEWAY_API_KEY?.trim() || headers.get("x-vercel-oidc-token") || env.VERCEL_OIDC_TOKEN?.trim() || null;
  const openRouterKey = env.OPENROUTER_API_KEY?.trim();
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
  const modelOverride = env.TUTOR_MODEL?.trim() || env.OPENROUTER_MODEL?.trim();
  const reasoningEffort = parseEffort(env.TUTOR_REASONING_EFFORT) ?? DEFAULTS.reasoningEffort;

  let chat: ChatProvider | null = null;
  if (env.DISABLE_AI === "1") {
    chat = null;
  } else if (anthropicKey) {
    chat = {
      name: "anthropic",
      protocol: "anthropic",
      endpoint: "https://api.anthropic.com/v1/messages",
      apiKey: anthropicKey,
      model: modelOverride || DEFAULTS.anthropicModel,
      reasoningEffort,
    };
  } else if (openRouterKey) {
    chat = {
      name: "openrouter",
      protocol: "openai",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openRouterKey,
      model: modelOverride || DEFAULTS.openRouterModel,
      extraHeaders: { "X-Title": "Nesalio", ...(env.NEXT_PUBLIC_APP_URL ? { "HTTP-Referer": env.NEXT_PUBLIC_APP_URL } : {}) },
      reasoningEffort,
    };
  } else if (gatewayToken) {
    chat = {
      name: "gateway",
      protocol: "openai",
      endpoint: `${GATEWAY_BASE}/v1/chat/completions`,
      apiKey: gatewayToken,
      model: modelOverride || DEFAULTS.gatewayModel,
      reasoningEffort,
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
