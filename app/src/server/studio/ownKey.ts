/**
 * Clé API de l'auteur : le studio peut appeler le modèle avec la clé de la
 * personne au lieu de celle du serveur. La clé arrive avec la requête, sert à
 * cet appel seulement, et n'est jamais enregistrée ni écrite dans les journaux.
 *
 * Reconnues par leur préfixe : Claude (sk-ant-…) et OpenRouter (sk-or-…).
 * Les modèles OpenAI passent par OpenRouter (même format d'appel que le reste
 * de l'app ; l'API d'OpenAI refuse certains réglages qu'on envoie).
 */
import { DEFAULTS, type ChatProvider } from "@/server/config";

export type OwnKeyResult = { ok: true; provider: ChatProvider } | { ok: false; message: string };

export function providerFromKey(apiKey: string, model?: string): OwnKeyResult {
  const key = apiKey.trim();
  const chosen = model?.trim() || undefined;
  if (key.startsWith("sk-ant-")) {
    return {
      ok: true,
      provider: {
        name: "anthropic",
        protocol: "anthropic",
        endpoint: "https://api.anthropic.com/v1/messages",
        apiKey: key,
        model: chosen ?? DEFAULTS.anthropicModel,
        reasoningEffort: "low",
      },
    };
  }
  if (key.startsWith("sk-or-")) {
    return {
      ok: true,
      provider: {
        name: "openrouter",
        protocol: "openai",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: key,
        model: chosen ?? DEFAULTS.openRouterModel,
        extraHeaders: { "X-Title": "Nesalio Studio" },
        reasoningEffort: "low",
      },
    };
  }
  if (key.startsWith("sk-")) {
    return { ok: false, message: "Les clés OpenAI ne sont pas prises en charge directement : passe par une clé OpenRouter (sk-or-…), qui donne aussi accès aux modèles OpenAI." };
  }
  return { ok: false, message: "Clé non reconnue : il faut une clé Claude (sk-ant-…) ou OpenRouter (sk-or-…)." };
}
