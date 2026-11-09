# Audit de parité et de retrait de l’ancien tuteur

9 novembre 2026 · branche `codex/kairos-json-contract`, arbre de travail basé sur `4c8e447`, changements locaux inclus.

## Verdict

**Nesalio prend déjà en charge le parcours d’explication par défaut quand un modèle est configuré. La parité avec le tuteur complet et la qualité des leçons de cette version restent à établir.** Le tuteur conserve des entrées actives et des fonctions propres. Les gros blocs remplaçables se repèrent en simulant la fermeture de ces entrées et la séparation des modules mixtes, même si leurs appels sont encore présents.

`/` et `/dev` choisissent `NesalioApp` avec un modèle configuré. `NESALIO_EXPLICATION=0`, la configuration sans modèle et, sur les hôtes autorisés, l’inspection JSON conservent un accès à `TutorApp`. Le choix se fait avant la génération. Une panne du modèle sur `/api/nesalio` ne déclenche donc aucun retour automatique au tuteur. L’état du déploiement et de ses variables n’a pas été vérifié.

## Taille

Lignes physiques, blancs et commentaires compris. Les lignes non vides comprennent aussi les commentaires. Les fichiers ignorés, dépendances, résultats de compilation, données JSON, médias et documentation sont exclus du décompte source. Les deux JSON de contrat dans `app/src` représentent 623 lignes à part.

| Périmètre | Fichiers | Lignes | Non vides |
| --- | ---: | ---: | ---: |
| `app/src` hors tests | 172 | 24 743 | 23 147 |
| Tests dans `app/src` | 84 | 9 699 | 8 841 |
| **Total `app/src`** | **256** | **34 442** | **31 988** |
| Configurations et outils source sous `app/` | 29 | 2 688 | 2 532 |
| **Total `app/`** | **285** | **37 130** | **34 520** |
| Site public, application et outils, hors `.claude` et `analyses` | 304 | 41 803 | 38 961 |
| Dépôt large, copies de travail `.claude` et scripts `analyses` inclus | 445 | 67 614 | 62 095 |

| Révision | `app/src` hors tests | Tests | Total |
| --- | ---: | ---: | ---: |
| `1c9d084`, avant l’ajout de Nesalio v3.3 | 16 612 | 4 951 | 21 563 |
| `f591c34`, premier ajout v3.3 | 21 623 | 7 750 | 29 373 |
| `4c8e447`, bascule par défaut de la page élève | 22 711 | 8 285 | 30 996 |
| Arbre audité à la reprise | 24 743 | 9 699 | 34 442 |

Depuis `1c9d084`, **+8 131 lignes applicatives (+49 %)** et **+4 748 lignes de tests**. Le delta inclut les modifications des modules communs. À la reprise, six fichiers ont changé de taille depuis le premier relevé. Le graphe d’imports et les fichiers candidats au retrait sont identiques.

## Parité par parcours

| Parcours | État dans Nesalio | Conséquence pour le retrait |
| --- | --- | --- |
| Question écrite, génération et tableau pendant la réponse | `/api/nesalio` génère des tranches validées et le lecteur les joue au fur et à mesure. Parcours déjà essayé sur `/` dans le journal. | Le premier tour d’explication du tuteur a un successeur. |
| Voix, synchronisation, pause et son coupé | ElevenLabs fournit des horodatages. Les gestes sans repère fiable sont reportés à la fin du passage. En panne de synthèse, Nesalio joue les sous-titres. | Le lecteur vocal et l’estimation de minutage anciens sont remplaçables. Le mode de secours a changé avec l’accord consigné dans `SUIVI.md`. |
| Revoir, arrêter, réessayer | Relecture locale de la leçon reçue, abandon au retour à l’accueil, message d’erreur. Le flux doit encore distinguer une fin explicite d’une fermeture prématurée. | Conserver le lecteur v3.3 et réparer la fin de flux avant de retirer le secours. |
| Micro | Saisie commune via `QuestionInput`, `/api/transcribe` et le secours de reconnaissance navigateur. Pendant une leçon, le micro met en pause et la soumission lance une nouvelle leçon. | Conserver la transcription. La reprise pédagogique d’une leçon interrompue reste une fonction du tuteur. |
| Dialogue, QCM, diagnostic, suivi et bilan | Le nouveau parcours explique une question à la fois. Les schémas de certains événements sont présents, sans parcours élève qui les joue. | Fonctionnalités mises de côté lors de la bascule. Leur retrait relève du périmètre produit. |
| Rendu et caméra | Nesalio a sa propre projection, ses placements et sa caméra. Il partage encore `ManimRenderer`, les primitives et des mesures. L’ancien propose entre autres le recentrage manuel. | Préserver ce que les deux systèmes utilisent. Comparer les figures anciennes encore utiles dans les matières retenues avant d’écarter leur implémentation. |
| Portée des leçons | Nesalio cible les mathématiques et la chimie. Le tuteur a des guides de physique et une démo de projectile. | Physique mise de côté par décision produit. |
| Démo sans IA et inspection | `/dev/nesalio` permet de relire des fixtures v3.3. `DISABLE_AI=1` et l’inspection du parcours élève continuent de sélectionner l’ancien. | La démo et `?inspect=1` ont été désignés pour retrait au moment de la suppression. Adapter l’écran sans modèle, les liens de connexion et le test navigateur. |
| Avis et questionnaire | Formulaires communs, avec questionnaire au retour à l’accueil ou après une minute sur la fin. Le signalement v3.3 transmet la question, le titre, l’état et des sous-titres récents. | `NesalioSession.recentContext()` fournit `board: []` et `replay: ""`. Un signalement ancien contient davantage de contexte. |
| Enregistrement et analyse | La relecture de Nesalio reste en mémoire. L’écriture Blob de tours passe par `recording.ts` et `/api/tutor`. `/api/seances` lit l’historique et le cron déclenche sa purge. | Trancher la télémétrie du nouveau parcours séparément. Conserver la lecture et la purge des archives tant qu’elles sont nécessaires. |

La comparaison du contrat v3.3 avec le registre de commandes du tuteur montre aussi une différence de couverture en maths. Nesalio possède les courbes, axes, polygones, tableaux et vecteurs, mais pas d’opérations dédiées pour les solides, le cercle trigonométrique, les constructions au compas, les modèles d’aire ou les transformations géométriques par matrice. Certaines figures se reconstruisent avec les primitives v3.3. Le contrat et les essais disponibles ne démontrent pas une équivalence de résultat. Ces commandes entrent dans le scénario de retrait du moteur historique, avec une décision de portage ou de retrait à prendre par famille de figures.

## Qualité et fiabilité

- **Chrome sur ordinateur, 1 366 × 800.** Parcours de `/dev` sur une copie, avec `NesalioApp` et une leçon NDJSON de test. Soumission, requête Nesalio, tableau, sous-titres après échec simulé de la voix, pause, reprise, bouton du son, fin, relecture sans régénération, questionnaire au retour et erreur avec « Réessayer » vérifiés. Aucune exception JavaScript pendant cet essai. Le script temporaire attend l’hydratation avant de saisir la question et suit le nouveau moment d’ouverture du questionnaire. Le serveur Webpack a averti que `pptxgenjs` est absent dans un import de `manim-web`. Le tableau s’est affiché pendant l’essai.
- La comparaison à l’aveugle sur 10 questions inédites dans `SUIVI.md` donne **62,6/100 à l’ancien tuteur, 54,5/100 à Nesalio en un appel**, 47,7 en deux temps. Un autre lot de huit questions favorisait légèrement Nesalio après retour des consignes pédagogiques. Les petits corpus et la sensibilité au choix des questions interdisent de généraliser. La comparaison à 10 questions précède les derniers travaux de fiabilité, de chimie et de justesse.
- Les corrections récentes valident plus de relations mathématiques et chimiques, et réparent certains résultats. La mesure historique sur 124 leçons concerne ces contrôles. Elle ne mesure ni la qualité des leçons nouvellement générées ni la parité pédagogique.
- Contrôle hors ligne des **24 fichiers `base-*.json`** de `analyses/generations`. Les 22 fichiers contenant des tranches restent chargeables comme leçons enregistrées. Deux anciens exports de chimie sont vides. En les passant au validateur des sorties modèle, 17 sont acceptés et cinq sorties non vides sont refusées par les contrôles de justesse. Parmi les refus, quatre sont en maths (paramètre sans effet, intérêts composés et deux pentes), un en physique (point hors des axes). Cet essai mesure la compatibilité et les refus sur des sorties archivées.
- `npm test -- --maxWorkers 4` à la reprise donne **807 réussis, 1 échec, 7 ignorés**. Les deux échecs du premier relevé dans `pedagogy.test.ts` sont résolus dans cet arbre. L’exemple de chimie à `domain/nesalio/chemistry.test.ts:45` contient le caractère de contrôle `U+0005` devant `{Fe…}` à la place de `\ce`. Le parseur renvoie `null`, que le test transmet à `balanceIssues`.
- `tsc --noEmit --incremental false` échoue dans `domain/tutor/controller.test.ts:167`. Un objet de test voit son discriminant `type` élargi à `string`. Ce test appartient au tuteur encore livré.
- `services/nesalio/stream.ts:51` peut finir l’itération sans avoir lu `end`. Dans `engine/nesalioSession.ts:89`, une itération sans erreur marque l’enregistrement complet. Reproduit avec Vitest sur une copie en envoyant l’en-tête et une tranche, sans `end`. La séance retourne `status: "done"`, `error: null` et `canReplay: true`. La route ferme aussi le flux sans émettre `error` si `events.next()` lève une exception inattendue.
- `app/.env.local` désactive l’IA et contient un jeton OIDC expiré. Aucun autre identifiant de génération n’y est configuré. La production, Clerk avec un compte élève, la politique Gateway de non-conservation, la voix et la transcription réelles n’ont pas été retestés pendant cet audit. Le choix de l’expliqueur dans le dépôt dépend de la présence d’une configuration, sans sondage préalable de sa disponibilité.

## Code orphelin et code retirable

**Aucun fichier source entier orphelin détecté** dans `app/src`. Le graphe part des pages, routes, layouts et du proxy Next, puis suit les imports, les réexports, les imports dynamiques littéraux et les imports de types. Il compte aussi les routes que l’interface élève ne visite plus. Cela mesure l’accessibilité statique des fichiers. Les tests et les outils font l’objet d’une passe distincte.

Le compilateur avec `--noUnusedLocals --noUnusedParameters` signale trois imports inutilisés (`MathContext` dans `nesalio/normalize.ts`, `isVisible` dans `scene/commands/constructions.ts` et `BoardState` dans `scene/commands/linear.ts`). Le schéma `ExecutionEvent`, dans `nesalio/contract.ts`, est exercé uniquement par `contract.test.ts`. Il décrit notamment les événements du futur tutorat. Le mode de génération à deux étages est désactivé par défaut et a été mis de côté. `NESALIO_DEUX_ETAPES=1` et les bancs de test peuvent encore l’activer. Ces éléments ne sont pas inclus dans le volume de l’ancien parcours déjà remplacé.

| Simulation cumulative | Fichiers entiers | Lignes physiques | Non vides |
| --- | ---: | ---: | ---: |
| Retirer `TutorApp` des entrées élève et fermer `/api/tutor`. Laisser le diagnostic du tuteur accessible. | 17 | 1 523 | 1 410 |
| Fermer aussi le GET de diagnostic du tuteur, garder le POST de validation v3.3, isoler `isUnavailable` et retirer les sélecteurs du tuteur et de l’inspection. | 25 | 2 515 | 2 332 |
| Séparer les modules mixtes et les types des archives, en conservant `ExecutionEvent` pour le futur. | 75 | 10 110 | 9 484 |
| Même séparation, avec retrait du schéma d’événements interactifs inutilisé par le parcours élève. | 78 | 10 393 | 9 744 |

Le lot de **25 fichiers** a été effectivement retiré sur une copie isolée. Après modification des entrées et extraction de `isUnavailable`, TypeScript passe sur le code applicatif et les outils TypeScript, hors tests. Les six tests ciblés des routes `/api/nesalio`, `/api/voice` et du POST `/api/diagnostic` passent sur cette copie. La variante sans IA y affiche un message d’indisponibilité. Ce choix de simulation reste à valider pour la vraie bascule.

Le scénario de **78 fichiers**, soit **42 % du source applicatif actuel**, reste une simulation de dépendances. Son chiffre brut inclut des fonctions abandonnées ou à archiver, ainsi que des lignes à déplacer dans des modules communs. Le gain net dépend du code conservé lors de ces extractions. Les 4 688 lignes de tests réparties dans les 36 fichiers qui importent directement au moins un fichier de ce scénario sont **à trier**, avec des tests communs à adapter. Elles sont exclues du total applicatif.

Deux blocs mixtes sont mesurés à part. Les méthodes anciennes de `ManimRenderer.ts` aux lignes 170–454 et 465–810 représentent **631 lignes** à examiner lors du découplage. Le corps du GET historique dans `app/api/diagnostic/route.ts`, lignes 52 à la fin du fichier, représente **245 lignes**, que la copie de retrait écarte en gardant le POST. Ces deux mesures sont hors des totaux de fichiers entiers.

### Ce qui est remplacé, ce qui disparaît, ce qui reste

| Bloc | Constat | Traitement |
| --- | --- | --- |
| Lecture des explications, flux, dessin et synchronisation anciens | `Player`, `httpSource`, les anciens locuteurs, le format `Step` et les commandes du tableau étaient la chaîne d’exécution. La chaîne actuelle utilise `NesalioSession`, `openNesalioStream`, `nesalioPlayback`, `nesalioClip`, `sceneState` et `NesalioProjection`. | Retirer les implémentations du premier tour et les formats d’exécution remplacés une fois l’ancien chemin fermé. Dans les fichiers mixtes, garder le moteur mathématique, les primitives, la mesure et le texte LaTeX. |
| Génération et consignes du premier tour | Le générateur v3.3 et `pedagogy.ts` couvrent de nouveau les grandes familles de notions. Les anciens guides et le prompt portent aussi des consignes d’interaction et de physique. | Isoler `ChatMessage` de `server/tutor/prompt.ts`, vérifier les écarts pédagogiques sur le corpus, archiver les guides utiles à la reprise du tuteur. Garder `chatCompletions.ts` et `ndjson.ts`. |
| Dialogue et suivi | QCM, diagnostic, indices gradués, adaptation aux réponses, bilans et modèles d’état. | Code encore utile si le tuteur interactif doit rester disponible. L’archiver est une décision de périmètre. Les modules avec fonctions mixtes sont comptés au niveau du fichier. |
| Anciennes démos et inspection | `demoLessons.ts` porte des leçons anciennes et la liste de questions utilisée par `StartScreen`. `?inspect=1` est propagé par les pages de connexion. | Extraire les questions suggérées, remplacer la suggestion de physique pour le périmètre actuel et retirer l’inspection lors de la bascule définitive. |
| Données et exploitation | `sessionLog.ts` retient l’ancien contrat par des imports de types. Il résume des données déjà enregistrées. `tools/analyse/seances.ts` utilise aussi les types et l’analyse du tuteur. | Figer le type de document des archives et déplacer ou adapter les outils d’analyse. Garder les routes de lecture et de purge et leur cron. |
| Contrats communs et fichiers mixtes | `ManimRenderer` contient l’ancienne projection et les appels à la nouvelle. `/api/diagnostic` contient deux contrats indépendants. | Le GET et les sections d’ancien rendu peuvent diminuer davantage le total. Ces lignes ne sont pas incluses dans les 10 393 lignes de fichiers entiers. |

### Passerelles à traiter avant une suppression

1. Retirer `TutorApp` de `/` et `/dev`, simplifier `server/explainer.ts` et `/api/status`, supprimer l’inspection des pages de connexion et d’inscription. Préciser l’affichage sans IA et la procédure de retour à la version précédente.
2. Séparer le GET de `/api/diagnostic` du POST Nesalio. Garder le POST et son contrôle d’accès. Adapter les consommateurs du GET (`tools/scenarios/jouer.mjs`, `tools/eval/evaluer.mjs`, `comparer-formats-modele.mjs`).
3. Sortir le prédicat `isUnavailable` de `server/tutor/service.ts`. Il est appelé par les deux routes partagées `/api/voice` et `/api/transcribe`. Distinguer dans `/api/voice` l’ancienne synthèse sans `cues`, son réglage et l’en-tête `X-Speech-Span` de la synthèse et des repères Nesalio. Garder le secours de reconnaissance vocale du micro.
4. Séparer dans `ManimRenderer` le cycle de vie de la scène, le redimensionnement, les interactions retenues et la projection v3.3. Le groupe `restore` / `sync` et l’ancienne fabrication des objets sont des candidats à retirer. Dans `board/layout.ts`, garder les tailles, mesures de texte et de matrices. Dans `board/geometry.ts`, garder `niceStep`. Garder `board/tex.ts` et les primitives Manim utilisées par la projection v3.3.
5. Extraire `ChatMessage`, `SpeechSpan`, les questions suggérées et `MAX_QUESTION_LENGTH`. Donner à `FeedbackButton` un type de fournisseur de contexte indépendant de `Player`, séparer les types de l’horloge et de la scène, et retirer de `theme.ts` le mappage propre aux états de l’ancien lecteur. Isoler le format des archives sans charger le moteur historique.
6. Remplacer le `test:e2e` par le parcours Nesalio quand le secours est retiré. L’ancien test attend une démo de projectile et « Je comprends pas ». Le test Nesalio existant attend encore le questionnaire dans les dix secondes après la fin, alors que l’application attend une minute ou le retour à l’accueil. Trier `tools/rejeu`, `tools/eval/tuteur-reel.test.mjs`, `verifier-segments-ui.mjs` et les scénarios Playwright du tuteur. Les imports TypeScript de `tools/analyse/seances.ts` entrent aussi dans `tsc`.

## Conditions de décision

1. Refaire passer `tsc` et la suite complète. Faire échouer explicitement les flux sans `end`. Aligner le parseur d’équations chimiques et son test sur le contrat voulu.
2. Comparer sur des questions neuves de maths et de chimie, avec le même modèle et une grille à l’aveugle. Mesurer les leçons arrivées au bout, les erreurs graves, la lisibilité et le délai du premier son. Le journal retient 95 % de leçons complètes, aucune erreur mathématique grave et une qualité au moins égale à celle de l’ancien tuteur.
3. Vérifier avec la configuration de déploiement la génération soumise à la politique de données, la synthèse avec horodatage et le micro en français québécois. Arrêter le périmètre du signalement rejouable et de l’enregistrement, ainsi que la disponibilité du tutorat interactif.
4. Une fois ces conditions remplies, faire le retrait par lots et compiler chaque lot. Exécuter le parcours élève, les outils retenus, la lecture des archives et la purge avec des données de test. Comparer ensuite le diff net au décompte brut.

## Reproduction du décompte

Inventaire par `git ls-files -z --cached --others --exclude-standard`, chemins dédoublonnés et fichiers présents uniquement. Extensions source comptées `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.css`, `.html`, `.py`, `.ps1`, `.sh`, `.sql`, déclarations `.d.ts` exclues. Sous `app/src`, les noms `.test.` et `.spec.` définissent les tests. Baselines lues depuis les objets Git. Les alias `@/`, chemins relatifs, index, CSS et JSON sont résolus. Pour chaque scénario, on retire du graphe les entrées et arêtes listées plus haut, puis on compte les fichiers applicatifs qui n’ont plus de chemin depuis une entrée. Les consommateurs d’URL sont recherchés séparément dans les outils et les scripts de configuration. Aucun import local de production non résolu par ce relevé. Les consommateurs externes d’API et les symboles inutilisés hors des cas cités ne sont pas mesurés exhaustivement.

## Inventaire des fichiers candidats

Chemins sous `app/src/`. Les groupes sont disjoints. Les trois derniers dépendent des extractions et décisions décrites plus haut.

### Retrait des entrées élève (17 fichiers, 1 523 lignes)

| Fichier | Lignes |
| --- | ---: |
| `app/api/tutor/route.ts` | 117 |
| `domain/tutor/inspection.ts` | 6 |
| `engine/playbackClock.ts` | 50 |
| `server/tutor/recording.ts` | 33 |
| `services/tutor/httpSource.ts` | 76 |
| `services/voice/browserSpeaker.ts` | 124 |
| `services/voice/cloudSpeaker.ts` | 205 |
| `ui/Caption.tsx` | 41 |
| `ui/Dock.tsx` | 243 |
| `ui/InspectionReplay.tsx` | 68 |
| `ui/TutorApp.tsx` | 204 |
| `ui/TutorInspection.module.css` | 92 |
| `ui/board/DiagnosticTag.module.css` | 42 |
| `ui/board/DiagnosticTag.tsx` | 48 |
| `ui/board/ManimBoard.tsx` | 95 |
| `ui/hooks/useFrameClock.ts` | 24 |
| `ui/hooks/useTutor.ts` | 55 |

### Retrait du diagnostic ancien et des sélecteurs (8 fichiers, 992 lignes)

| Fichier | Lignes |
| --- | ---: |
| `domain/timeline/syncCheck.ts` | 135 |
| `domain/tutor/cues.ts` | 113 |
| `domain/tutor/modelOutput.ts` | 334 |
| `domain/tutor/talkShow.ts` | 76 |
| `server/ai/syncMeasure.ts` | 43 |
| `server/explainer.ts` | 14 |
| `server/tutor/inspection.ts` | 5 |
| `server/tutor/service.ts` | 272 |

### Découplage des modules communs (18 fichiers, 2 615 lignes)

| Fichier | Lignes |
| --- | ---: |
| `content/demoLessons.ts` | 342 |
| `domain/scene/stepAccess.ts` | 13 |
| `domain/timeline/plan.ts` | 113 |
| `domain/timeline/spokenTime.ts` | 151 |
| `domain/tutor/controller.ts` | 144 |
| `domain/tutor/progress.ts` | 60 |
| `domain/tutor/teachingPolicy.ts` | 114 |
| `domain/tutor/turnReview.ts` | 117 |
| `engine/player.ts` | 789 |
| `engine/renderBarrier.ts` | 15 |
| `server/tutor/domains/algebre.ts` | 54 |
| `server/tutor/domains/fonctions.ts` | 70 |
| `server/tutor/domains/geometrie.ts` | 43 |
| `server/tutor/domains/index.ts` | 19 |
| `server/tutor/domains/physique.ts` | 29 |
| `server/tutor/domains/polynomes.ts` | 64 |
| `server/tutor/domains/types.ts` | 7 |
| `server/tutor/prompt.ts` | 471 |

### Découplage du format des archives (32 fichiers, 4 980 lignes)

| Fichier | Lignes |
| --- | ---: |
| `domain/board/apart.ts` | 103 |
| `domain/board/collisions.ts` | 191 |
| `domain/board/free.ts` | 108 |
| `domain/board/room.ts` | 51 |
| `domain/board/shapes.ts` | 238 |
| `domain/board/state.ts` | 376 |
| `domain/board/steps.ts` | 93 |
| `domain/scene/commands/analysis.ts` | 106 |
| `domain/scene/commands/areaModel.ts` | 128 |
| `domain/scene/commands/camera.ts` | 25 |
| `domain/scene/commands/conics.ts` | 198 |
| `domain/scene/commands/constructions.ts` | 251 |
| `domain/scene/commands/define.ts` | 30 |
| `domain/scene/commands/emphasis.ts` | 44 |
| `domain/scene/commands/figure.ts` | 163 |
| `domain/scene/commands/images.ts` | 284 |
| `domain/scene/commands/index.ts` | 187 |
| `domain/scene/commands/linear.ts` | 143 |
| `domain/scene/commands/motion.ts` | 323 |
| `domain/scene/commands/parts.ts` | 160 |
| `domain/scene/commands/points.ts` | 63 |
| `domain/scene/commands/shapes.ts` | 612 |
| `domain/scene/commands/solids.ts` | 355 |
| `domain/scene/commands/steps.ts` | 97 |
| `domain/scene/commands/structure.ts` | 54 |
| `domain/scene/commands/text.ts` | 122 |
| `domain/scene/commands/trigCircle.ts` | 72 |
| `domain/scene/commands/vectors.ts` | 108 |
| `domain/scene/primitives.ts` | 43 |
| `domain/scene/schema.ts` | 101 |
| `domain/tutor/learning.ts` | 66 |
| `domain/tutor/request.ts` | 85 |

### Fichiers supplémentaires si le schéma interactif est retiré (3 fichiers, 283 lignes)

| Fichier | Lignes |
| --- | ---: |
| `domain/tutor/assessment.ts` | 120 |
| `domain/tutor/dialogue.ts` | 113 |
| `domain/tutor/plan.ts` | 50 |

### Tests impactés par le scénario de 78 fichiers

Un import direct signale un test à revoir. Certains resteront sur les briques communes après modification.

- `app/api/tutor/route.test.ts`
- `domain/board/apart.test.ts`
- `domain/board/collisions.test.ts`
- `domain/board/state.test.ts`
- `domain/board/steps.test.ts`
- `domain/board/tex.test.ts`
- `domain/scene/commands/analytic.test.ts`
- `domain/scene/commands/constructions.test.ts`
- `domain/scene/commands/images.test.ts`
- `domain/scene/commands/shapes.test.ts`
- `domain/scene/commands/solids.test.ts`
- `domain/scene/segmented.test.ts`
- `domain/sessionLog.test.ts`
- `domain/timeline/plan.test.ts`
- `domain/timeline/spokenTime.test.ts`
- `domain/timeline/syncCheck.test.ts`
- `domain/tutor/assessment.test.ts`
- `domain/tutor/controller.test.ts`
- `domain/tutor/cues.test.ts`
- `domain/tutor/learning.test.ts`
- `domain/tutor/modelOutput.test.ts`
- `domain/tutor/plan.test.ts`
- `domain/tutor/progress.test.ts`
- `domain/tutor/talkShow.test.ts`
- `domain/tutor/teachingPolicy.test.ts`
- `domain/tutor/turnReview.test.ts`
- `engine/player.test.ts`
- `engine/reproductions.test.ts`
- `server/accountRoutes.test.ts`
- `server/ai/syncMeasure.test.ts`
- `server/explainer.test.ts`
- `server/tutor/domains/sn4.test.ts`
- `server/tutor/prompt.test.ts`
- `server/tutor/recording.test.ts`
- `server/tutor/service.test.ts`
- `services/voice/cloudSpeaker.test.ts`
