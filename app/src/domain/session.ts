/**
 * Session de navigation : un identifiant tiré au hasard à l'ouverture de la
 * page, gardé en mémoire seulement (ni cookie, ni stockage). Recharger la page
 * en crée une nouvelle ; rien n'est enregistré nulle part.
 *
 * Il ne sert qu'à séparer les utilisateurs côté serveur : chaque session a sa
 * propre limite de requêtes (une classe entière sur le même Wi-Fi ne se partage
 * plus une seule limite) et les journaux du serveur la mentionnent.
 */
export const SESSION_HEADER = "x-nesalio-session";

/** Format accepté : 8 à 64 caractères, lettres, chiffres ou tirets (un UUID, typiquement). */
export function isSessionId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);
}

/** Forme courte, pour les journaux (« a3f9c2e1 »). */
export const shortSession = (id: string) => id.replace(/-/g, "").slice(0, 8);
