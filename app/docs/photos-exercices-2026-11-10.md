# Photos d'exercices et de notions de cours

10 novembre 2026. Recherche et intégration demandées par l'utilisateur.

## Parcours de l'élève

1. Depuis le champ de question, choisir **Ajouter une photo** et sélectionner
   une photo JPG, PNG ou WebP d'un exercice ou d'un passage de cours.
2. Nesalio prépare l'image, puis en extrait le texte, les formules et les
   informations utiles des schémas. Une notion sans question écrite est acceptée.
3. Vérifier et, au besoin, corriger le texte reconnu. Une question complémentaire
   peut être écrite ou dictée dans le champ habituel.
4. **Demander à Nesa** lance la leçon avec ce contenu, dans le parcours existant.

La première version traite une photo par question. Les photos floues ou les
pages trop chargées peuvent demander un recadrage. Une lecture incertaine doit
être vérifiée par l'élève, particulièrement pour les signes, exposants et unités.

## Modèle et coût

Le modèle de lecture par défaut est `anthropic/claude-haiku-5.5`, via le Gateway
déjà utilisé pour Nesalio. La même authentification AI Gateway est réutilisée.
`PHOTO_MODEL` permet de comparer un autre modèle compatible avec les images
et les réponses JSON structurées. Le générateur de leçons conserve son modèle.

Tarifs consultés le 10 novembre, en dollars US par million de jetons.

| Modèle | Entrée | Sortie | État de la comparaison |
| --- | --- | --- | --- |
| Claude Haiku 5.5 | 0,10 $ | 0,50 $ | Retenu après un premier banc réel |
| Gemini 3.1 Flash-Lite | 0,25 $ | 1,50 $ | Essayé sur le même banc |
| Gemini 2.5 Flash-Lite | 0,10 $ | 0,40 $ | Repéré dans le catalogue, non essayé |

Sources officielles des tarifs et des capacités d'image. [Haiku 5.5](https://vercel.com/ai-gateway/models/claude-haiku-5.5),
[Gemini 3.1 Flash-Lite](https://vercel.com/ai-gateway/models/gemini-3.1-flash-lite),
[tarifs Google](https://ai.google.dev/gemini-api/docs/pricing/).

Pour un exemple de 2 000 jetons en entrée et 500 en sortie, Haiku coûte
0,00045 $ par lecture, soit 0,45 $ pour 1 000 lectures. Il s'agit d'un calcul
sur un scénario, auquel s'ajoutent la leçon et la voix. Les dimensions de la
photo et le texte extrait font varier le coût réel.

## Premier banc réel

`tools/eval/photo-reelle.test.mjs` a envoyé cinq images synthétiques à chacun
des deux modèles, avec les protections de données du code de production.
Les images couvrent une équation avec fraction, une réaction chimique,
un triangle rectangle, une définition de fonction affine et une page vide.

| Mesure | Haiku 5.5 | Gemini 3.1 Flash-Lite |
| --- | --- | --- |
| Cas réussis selon les contrôles du banc | 5 / 5 | 5 / 5 |
| Délai moyen de lecture | 1,94 s | 4,70 s |
| Coût total des cinq lectures | 0,001244 $ | 0,00321875 $ |

Le rapport conserve le texte extrait, les jetons et le coût renvoyés par le
Gateway dans `analyses/photos-2026-11-10/rapport.json`. Les textes et le refus de
la page vide ont été relus. Ce petit corpus ne mesure pas l'écriture manuscrite,
les vraies photos inclinées, les reflets ou la qualité pédagogique de la leçon.
La prochaine mesure doit employer des photos scolaires réelles.

## Intégration

- `services/photo.ts` prépare une copie JPEG de 1 600 px au plus et 1,5 Mo au
  plus. Le redessin retire les métadonnées et applique l'orientation.
- `/api/photo` vérifie le compte, la limite de demandes, le corps reçu et les
  dimensions JPEG, puis attend le modèle pendant 35 secondes au maximum.
- `server/ai/photo.ts` demande une transcription et une description du schéma,
  avec les endroits incertains. Il refuse une réponse coupée ou illisible.
- `ui/QuestionInput.tsx` affiche l'aperçu, le texte modifiable et les erreurs.
  Remplacer ou retirer la photo annule la lecture précédente.
- `/api/nesalio` accepte jusqu'à 4 500 caractères pour recevoir l'énoncé sans
  le tronquer. L'enregistrement existant conserve la question et ce contenu.

L'image est transmise au fournisseur pour sa lecture. Cette route conserve
uniquement le résultat dans le navigateur ; le contenu envoyé ensuite avec la
question suit l'enregistrement habituel des séances. Les protections Gateway
existantes contre l'entraînement et pour la non-conservation sont réutilisées.
Le catalogue annonce ces deux engagements chez tous les fournisseurs Haiku 5.5.
[Traitement des images](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/images),
[protections Gateway](https://vercel.com/docs/ai-gateway/security-and-compliance).

## Vérification reproductible

Dans `app/`, `npm run typecheck` puis
`npx vitest run src/server/ai/photo.test.ts src/app/api/photo/route.test.ts src/app/api/nesalio/route.test.ts`.
Le parcours navigateur est dans `tools/e2e/photo.mjs` et simule les API payantes.
Le banc réel est ignoré normalement et s'active avec `PHOTO_REELLE=1`.
