/** Consignes d'un domaine : quelques règles courtes, tirées de séances réelles. */
export interface DomainGuide {
  id: string;
  title: string;
  /** Une règle par ligne, courte et concrète (ce qu'il faut dessiner, l'erreur à éviter). */
  rules: string[];
}
