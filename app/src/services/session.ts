/**
 * La session de cette page (voir domain/session.ts) : créée au premier appel,
 * oubliée au rechargement. Volontairement en mémoire seulement.
 */
import { SESSION_HEADER } from "@/domain/session";

let current: string | null = null;

export function sessionId(): string {
  if (!current) {
    current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
  return current;
}

/** En-têtes à joindre à chaque appel à l'API. */
export function sessionHeaders(): Record<string, string> {
  return { [SESSION_HEADER]: sessionId() };
}
