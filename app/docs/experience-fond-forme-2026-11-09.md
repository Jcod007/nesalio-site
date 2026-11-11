# Expérience sur la séparation du fond et de la forme

9 novembre 2026 · Nesa · essai comparatif sur questions synthétiques.

## Question testée

Est-ce que retirer des consignes techniques améliore l’explication ? Une seconde passe dédiée à la forme apporte-t-elle davantage qu’un seul appel avec le prompt allégé ?

## Protocole

| Variante | Fond | Forme |
| --- | --- | --- |
| **A — Complet** | Prompt de référence de `server/nesalio/prompt.ts`, avec le guide de la notion lorsqu’il est déclenché | Même appel, génération directe du flux Nesalio v3.3 |
| **B — Allégé** | Même rôle pédagogique et même guide | Même appel, variante `allegees` du dépôt, qui délègue certaines contraintes techniques au validateur et au mécanisme de réparation |
| **C — Deux appels** | `buildTeacherMessages` prépare un script texte avec des lignes `DIT` et `TABLEAU`. Le modèle reçoit le guide de la notion et les capacités du tableau. | Le second appel reçoit le script, le contrat v3.3 et les règles de dessin. Le banc retire le rôle pédagogique, le guide, l’exemple pédagogique de leçon complète et le rappel d’expliquer pourquoi. Il demande de recopier le texte parlé dans le même ordre. |

Deux tirages par question et par variante, ordre des variantes alterné, trois leçons simultanées. Même modèle `deepseek/deepseek-v4.1-flash`, effort de raisonnement `none` sur les appels initiaux et les réparations. Même générateur, normalisation et validation. Vercel AI Gateway reçoit les demandes de non-conservation et de non-entraînement. Les fournisseurs éligibles restent sélectionnés par le Gateway. Le chronomètre commence avant le premier appel, et inclut le script dans C. Les appels de réparation sont comptés séparément des appels initiaux dans l’interprétation.

Le banc est opt-in. Exécution dans `app/` avec la clé locale dédiée. Il conserve les prompts et les sorties de chaque étape dans `analyses/banc/fond-forme-2026-11-09/`. Il arrête de lancer des leçons si le Gateway refuse l’authentification ou le quota.

```powershell
$env:FOND_FORME = '1'
$env:FOND_FORME_TIRAGES = '2'
$env:FOND_FORME_MODELE = 'deepseek/deepseek-v4.1-flash'
node node_modules/vitest/vitest.mjs run tools/eval/fond-forme.test.mjs --maxWorkers 1 --silent=false
```

## Grille de comparaison

Les trois points ci-dessous sont fixés pour chaque question avant notation. Un point est attribué si l’élément apparaît correctement dans la parole ou dans un élément montré au tableau. Toute contradiction de fond est relevée séparément. Pour C, les mêmes points sont appliqués au script initial et au résultat final.

| Question | 1 point | 1 point | 1 point |
| --- | --- | --- | --- |
| Équation `(3x − 2)/4 = (x + 6)/2` | Éliminer correctement les dénominateurs, par exemple en multipliant les deux membres par 4 | Déduire `x = 14` | Vérifier la solution dans les deux membres de départ, ou expliquer explicitement la simplification de chaque dénominateur |
| Tangente à `x² − 4x + 1` en 3 | Dérivée `2x − 4`, pente `2` | Point `(3, −2)` | Équation `y = 2x − 8` ou forme équivalente |
| Urne, 5 rouges et 3 bleues, 2 tirages | Sans remise, 7 boules au second tirage | Compter les deux ordres rouge-bleue et bleue-rouge | Probabilité `15/28` ou valeur équivalente |
| Sommet de `x² + 6x − 7` | Utiliser la moitié de 6 et compenser le `+9` | Obtenir `(x + 3)² − 16` | Lire et expliquer le sommet `(-3, −16)` |
| Équilibrage de `Al + O₂ → Al₂O₃` | Expliquer que les coefficients changent, les indices restent | Utiliser six atomes d’oxygène dans l’équation minimale | Équation finale `4 Al + 3 O₂ → 2 Al₂O₃` |
| Dilution de 25 mL à 0,60 mol/L jusqu’à 150 mL | Conservation de la quantité de soluté | Utiliser le volume final dans `C₁V₁ = C₂V₂` ou une démarche équivalente | Résultat `0,10 mol/L` |

Mesures complémentaires. Une **leçon intacte** a reçu `end`, ne présente aucune tranche perdue et passe la validation de la leçon entière. La **fidélité orale** de C exige la même suite de `DIT` et de `say`, avec normalisation Unicode et des espaces. Une phrase reformulée, ajoutée ou manquante fait échouer la comparaison exacte. Le score de fond indique séparément si une modification touche la réponse ou sa justification. Le délai mesuré s’arrête à la première tranche validée. Il exclut la voix et le rendu navigateur.

## Résultats

**Le prompt allégé obtient le même score de fond que les deux appels et livre la première tranche trois fois plus vite.** Les deux appels produisent une leçon intacte et sans erreur grave de plus, mais une leçon s’interrompt et deux erreurs du script sont transmises au résultat final. Le petit échantillon justifie de poursuivre la comparaison, sans bascule sur ce seul résultat.

Le banc a terminé les **36 essais** en 4 min 37 s, avec **69 appels au modèle**, réparations comprises. Les notes ci-dessous proviennent de la lecture du texte prononcé et des objets activés au tableau. Les sorties finales ont été relues sous des identifiants anonymisés par un seul correcteur. Le rapport recoupe ensuite les scripts et les journaux de validation.

| Mesure sur 12 essais par variante | A · complet | B · allégé | C · deux appels |
| --- | ---: | ---: | ---: |
| Points de fond dans la leçon finale, sur 36 | 32 | 34 | 34 |
| Leçons intactes selon le moteur | 12 | 12 | 11 |
| Leçons avec au moins une erreur grave de fond | 5 | 4 | 2 |
| Leçons intactes, 3/3 au fond et sans erreur grave | 7 | 8 | 9 |
| Leçons intactes sans nouvel appel de réparation | 6 | 7 | 7 |
| Refus de tranches ou d’en-tête consignés | 6 | 7 | 9 |
| Appels au modèle, réparations incluses | 18 | 19 | 32 |
| Première tranche validée, médiane | 4,0 s | 3,9 s | 12,4 s |
| Première tranche validée, maximum | 18,0 s | 25,1 s | 100,9 s |
| Durée totale, médiane | 14,2 s | 14,8 s | 24,6 s |

Les longueurs des prompts système réellement enregistrés sont **36 984 caractères** en A et **35 618** en B, soit **3,7 %** de moins. En C, le prompt enseignant fait **8 225** caractères et celui du metteur en forme **25 351**. Il faut ajouter aux deux derniers le guide transmis à l’enseignant, le script transmis au metteur en forme et les messages de réparation éventuels. La réduction de B porte sur un sous-ensemble de règles techniques, dans une version qui conserve les mêmes exemples et références de langage. L’essai ne mesure pas l’effet d’une réduction beaucoup plus importante.

### Ce qui se passe entre les deux appels

- **Avant mise en forme, les scripts C marquent 36/36 sur les éléments attendus et deux contiennent une erreur grave.** Après mise en forme, les mêmes deux erreurs restent et le score descend à **34/36**. La perte de deux points vient d’une seule leçon interrompue.
- **Tangente, premier tirage.** Le script établit `f′(3) = 2`, `(3, −2)` et `y = 2x − 8`. Le metteur en forme ne livre que deux tranches. L’en-tête contient un symbole inconnu, des points sortent des axes proposés par le script, puis une tranche JSON illisible est suivie d’un repère introuvable. La réponse attendue se trouvait après ces tranches. Le premier appel prend 85,2 s sur cet essai et la première tranche arrive à 100,9 s.
- **Dilution, premier tirage.** Le script écrit `0,015` mole au tableau, mais dit `0,115` dans la division. Le second appel conserve la contradiction mot pour mot. Il en va de même pour la fausse pente `f′(1)=2` dans le second tirage de la tangente.
- **Fidélité orale.** La séquence est identique dans **8 leçons sur 12**, dont **8 sur les 11 intactes**. Sur les leçons intactes, **166 des 167 phrases attendues** sont retrouvées mot pour mot dans l’ordre. Les trois écarts de séquence qui subsistent tiennent à une reformulation ou à une phrase supplémentaire. La leçon interrompue n’en conserve que 3 sur 23 au sens de la comparaison exacte.

### Interprétation

Sur ces six questions, un seul appel allégé passe de 32 à 34 points de fond et conserve 12 leçons intactes sur 12. Le résultat est compatible avec un petit bénéfice, mais la différence repose notamment sur les tirages de la tangente et de l’urne. Le mode en deux appels fait moins d’erreurs graves dans cet échantillon. Son meilleur résultat intermédiaire ne se traduit toutefois pas par un meilleur score de fond final que B, et il coûte un appel de plus même quand aucune réparation n’est nécessaire.

Pour tester l’hypothèse avec plus de précision, la suite serait de comparer A et B sur le même corpus élargi, puis d’évaluer séparément la capacité de mise en forme de C à partir de **scripts de référence vérifiés et identiques entre les essais**. Le pilote actuel évalue une version précise des deux étapes sur DeepSeek. Il couvre six questions, deux tirages et une lecture des traces, sans deuxième correcteur ni vérification du rendu à l’écran. Les chiffres ne remplacent pas les critères de confiance de la grille Nesalio.

## Traces

- `app/tools/eval/fond-forme.test.mjs` contient le corpus, les transformations de prompts et la mesure de fidélité.
- `analyses/banc/fond-forme-2026-11-09/protocole.json` conserve les quatre prompts système et les questions exactes.
- `analyses/banc/fond-forme-2026-11-09/resultats.json` contient les 36 mesures automatiques. `notation.json` contient la note et les erreurs relevées par leçon, y compris au stade du script.
- Les fichiers individuels du même dossier contiennent les sorties brutes, le script, les appels, les tranches validées et les journaux de refus.
- Vérifications locales en plus du banc réel. Le fichier du banc se charge et reste désactivé lors d’une exécution ordinaire. Les 76 tests ciblés du prompt, du générateur et des utilitaires de mesure passent.
