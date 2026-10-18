/**
 * Session de navigation : un identifiant tiré au hasard à l'ouverture de la
 * page, gardé en mémoire seulement (ni cookie, ni stockage dans le navigateur).
 * Recharger la page en crée une nouvelle.
 *
 * Il sépare les utilisateurs côté serveur : chaque session a sa propre limite
 * de requêtes (une classe entière sur le même Wi-Fi ne se partage plus une
 * seule limite), et il regroupe les tours d'une séance enregistrée.
 */
export const SESSION_HEADER = "x-nesalio-session";

/**
 * Référence de l'inscription sur le site (?ref=… dans l'adresse de l'outil) :
 * anonyme, elle relie les séances d'une personne à son inscription (courriel,
 * réponses) sans que le courriel passe par l'outil. Absente si la personne est
 * arrivée sans s'inscrire.
 */
export const REF_HEADER = "x-nesalio-ref";
export const REF_PATTERN = /^[a-z0-9]{6,20}$/;

export function isRef(value: string | null | undefined): value is string {
  return typeof value === "string" && REF_PATTERN.test(value);
}

/** La référence jointe à une requête, si elle est valide. */
export function refFromHeaders(headers: Headers): string | null {
  const raw = headers.get(REF_HEADER);
  return isRef(raw) ? raw : null;
}

/** Format accepté : 8 à 64 caractères, lettres, chiffres ou tirets (un UUID, typiquement). */
export function isSessionId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);
}

/** Forme courte, pour les journaux (« a3f9c2e1 »). */
export const shortSession = (id: string) => id.replace(/-/g, "").slice(0, 8);
