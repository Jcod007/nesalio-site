/**
 * Envoi vers le formulaire du site (Formspree) : retours de testeurs et
 * réponses d'après essai. L'application ne garde rien ; tout arrive au même
 * endroit que les inscriptions, trié par le champ « etape ».
 */
const DEFAULT_ENDPOINT = "https://formspree.io/f/xrpeoeqv";

/**
 * Le formulaire Formspree exige un champ « email » (sinon : 422, rien n'arrive).
 * Les réponses d'après essai n'en ont jamais, et le courriel est facultatif dans
 * « Signaler un problème » : on met alors une adresse repère, reconnaissable
 * dans la boîte de réception, au lieu de perdre la réponse.
 */
export const NO_EMAIL = "sans-courriel@nesalio.com";

export function withEmail(payload: Record<string, string>): Record<string, string> {
  if (payload.email?.trim()) return payload;
  return { ...payload, email: NO_EMAIL };
}

export async function forwardToForm(payload: Record<string, string>): Promise<boolean> {
  const endpoint = process.env.FEEDBACK_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(withEmail(payload)),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return true;
    console.warn("formulaire : envoi refusé", response.status, (await response.text()).slice(0, 300));
  } catch (error) {
    console.warn("formulaire : injoignable", error);
  }
  return false;
}
