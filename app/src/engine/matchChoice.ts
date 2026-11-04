/**
 * Le choix que désigne une réponse dite ou tapée : le texte d'un choix, sa
 * lettre (« b ») ou son rang (« la deuxième »). `null` si rien ne correspond
 * clairement : c'est alors une réponse libre.
 */
export function matchChoice(text: string, choices: readonly string[]): number | null {
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N},.√±−+×÷=/ ]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  const said = fold(text);
  if (!said) return null;
  const exact = choices.findIndex((choice) => fold(choice) === said);
  if (exact >= 0) return exact;
  const ordinals = [
    ["a", "premier", "premiere", "1er", "la 1"],
    ["b", "deuxieme", "second", "seconde", "2e"],
    ["c", "troisieme", "3e"],
    ["d", "quatrieme", "4e"],
  ];
  const byRank = ordinals.findIndex((words, i) => i < choices.length && words.some((w) => said === w || said === `la ${w}` || said === `reponse ${w}`));
  if (byRank >= 0) return byRank;
  // Un seul choix contenu dans la réponse (ou qui la contient) : c'est lui.
  const contained = choices
    .map((choice, i) => ({ i, c: fold(choice) }))
    .filter(({ c }) => c.length > 0 && (said.includes(c) || (said.length >= 3 && c.includes(said))));
  return contained.length === 1 ? contained[0]!.i : null;
}
