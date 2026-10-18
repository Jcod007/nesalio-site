/**
 * La session de cette page (voir domain/session.ts) : créée au premier appel,
 * oubliée au rechargement. Volontairement en mémoire seulement.
 * La référence d'inscription (?ref=…) est lue dans l'adresse et jointe aux appels.
 */
import { REF_HEADER, SESSION_HEADER, isRef } from "@/domain/session";

let current: string | null = null;
let ref: string | null | undefined;

export function sessionId(): string {
  if (!current) {
    current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
  return current;
}

/** Référence de l'inscription faite sur le site, lue une fois dans l'adresse de la page. */
export function signupRef(search: string | undefined = typeof window !== "undefined" ? window.location.search : undefined): string | null {
  if (ref === undefined && search !== undefined) {
    const value = new URLSearchParams(search).get("ref");
    ref = isRef(value) ? value : null;
  }
  return ref ?? null;
}

/** En-têtes à joindre à chaque appel à l'API. */
export function sessionHeaders(): Record<string, string> {
  const r = signupRef();
  return { [SESSION_HEADER]: sessionId(), ...(r ? { [REF_HEADER]: r } : {}) };
}
