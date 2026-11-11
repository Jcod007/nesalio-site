# Règles pour les IA qui codent sur Nesalio

Plusieurs IA travaillent sur ce dépôt (Codex, Claude Code…), souvent l'une après
l'autre sur la même branche. Chacune doit pouvoir reprendre le travail de l'autre
sans se perdre.

## Règle : documenter où on en est

1. **Avant de commencer**, lire [SUIVI.md](SUIVI.md) : chantier en cours, ce qui
   est fait, ce qui reste, décisions prises et points ouverts.
2. **Pendant le travail**, mettre à jour `SUIVI.md` à chaque étape terminée, pas
   seulement à la fin. Une session peut s'arrêter à tout moment (limite d'usage,
   coupure) : ce qui n'est pas écrit est perdu pour la suivante.
3. **Chaque entrée dit** :
   - ce qui a été fait, avec les fichiers touchés ;
   - ce qui a été vérifié et comment (tests, navigateur), et ce qui ne l'a pas été ;
   - les décisions prises avec l'utilisateur, et pourquoi ;
   - la prochaine étape concrète.
4. **Ne pas réécrire l'historique** des autres : corriger une information fausse,
   mais garder la trace des décisions.
5. Rédiger en français, court et factuel. Pas de résumé de code que `git diff`
   montre déjà : noter ce qui ne se devine pas en lisant le code.

La documentation propre à l'application se trouve dans `app/docs/` et
`app/AGENTS.md` (règles Next.js).
