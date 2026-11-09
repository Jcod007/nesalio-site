/** Le panneau montre la sortie du modèle uniquement sur le serveur de développement local. */
export function localInspectionAvailable(host: string | null): boolean {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL
    && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host ?? "");
}
