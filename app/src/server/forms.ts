/**
 * Envoi vers le formulaire du site (Formspree) : retours de testeurs et
 * réponses d'après essai. L'application ne garde rien ; tout arrive au même
 * endroit que les inscriptions, trié par le champ « etape ».
 */
const DEFAULT_ENDPOINT = "https://formspree.io/f/xrpeoeqv";

export async function forwardToForm(payload: Record<string, string>): Promise<boolean> {
  const endpoint = process.env.FEEDBACK_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return true;
    console.warn("formulaire : envoi refusé", response.status, (await response.text()).slice(0, 300));
  } catch (error) {
    console.warn("formulaire : injoignable", error);
  }
  return false;
}
