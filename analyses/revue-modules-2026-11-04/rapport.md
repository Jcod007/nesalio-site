# Revue des modules Nesalio — 4 novembre 2026

La structure générale est bonne et mérite d'être conservée. Le domaine reste indépendant de React, du réseau et du rendu. En revanche, l'état actuel présente des défauts de robustesse reproductibles dans les transitions de tours, la voix, le micro et la lecture des flux. L'affirmation « aucun code mort » ne tient pas pour le site vitrine et quelques déclarations de l'application.

Cette revue porte sur les fichiers présents, y compris les modifications non commitées. Aucun fichier applicatif n'a été corrigé. Les seuls ajouts de cette revue sont dans ce dossier.

## Vérifications effectuées

- `npm test -- --reporter=dot` : **48 fichiers, 471 tests réussis**.
- `npm run typecheck` : **réussi**.
- `npm run build` : **réussi**, compilation Next.js et génération des routes terminées.
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` : **deux erreurs**, imports inutilisés `isVisible` dans `commands/constructions.ts:17` et `BoardState` dans `commands/linear.ts:17`.
- Inventaire des **120 fichiers TypeScript/TSX applicatifs hors tests**, imports statiques et imports dynamiques littéraux : aucun fichier entièrement inaccessible depuis les points d'entrée Next.js, aucun cycle détecté, aucune dépendance du domaine vers UI/services/serveur/moteur, ni du moteur vers UI/services/serveur/contenu.
- **Sept reproductions ciblées échouent sur le comportement attendu**, confirmant six défauts fonctionnels ci-dessous. Elles sont séparées de la suite applicative et n'en changent pas les résultats.
- Lecture des pages de la vitrine, de leurs scripts intégrés, des générateurs et de la préparation des fichiers publics.

L'inventaire d'imports est une analyse statique simple, pas une preuve d'absence de code mort à l'intérieur des fichiers. Les reproductions utilisent des ports et API navigateur simulés. Les connexions Clerk réelles, les services IA payants et un parcours graphique WebGL complet n'ont pas été exécutés.

## Défauts à corriger

### 1. P1 — Une requête vocale bloquée peut immobiliser toute la séance

**Sources :** `app/src/services/voice/cloudSpeaker.ts:51`, `:107` ; `app/src/engine/player.ts:599`, `:669`.

`fetchClip()` n'a ni délai maximal ni signal d'annulation. Le délai de huit secondes de `prepareSpeech()` ne termine que l'attente de préparation : `speak()` réutilise ensuite la même promesse de chargement. Si elle reste pendante, `speech.done` ne se résout jamais et le lecteur reste en `playing`. Le délai de démarrage de quatre secondes permet de dessiner, mais ne débloque pas la fin de la phrase.

**Reproduction :** `/api/voice` ne répond jamais ; après 60 secondes simulées, le lecteur est toujours en `playing`.

**Correction :** borner et annuler le chargement dans l'adaptateur vocal, déclencher effectivement le repli, et garantir la résolution de chaque `SpeechHandle`. Garder cette logique réseau dans `services/voice`, avec un filet de sécurité dans le moteur.

### 2. P2 — Une réponse donnée avant l'événement `await` est perdue

**Source :** `app/src/engine/player.ts:350`.

La question devient utilisable dès que son étape est jouée. Si le paquet contenant `await` est retardé, `answered()` abandonne la réponse parce que `segment.awaiting` est encore faux. Elle n'est jamais placée dans `pendingAnswer`. À réception de `await`, le lecteur termine sans ouvrir le tour suivant.

**Reproduction :** étape interrogative reçue, réponse soumise, puis seulement réception de `await` ; un seul appel `question`, aucun appel `continue`.

**Correction :** mémoriser la réponse à l'étape immédiatement ; ouvrir le tour suivant dès que les conditions du protocole sont réunies. Cette transition appartient au moteur.

### 3. P2 — Une erreur HTTP ou un flux incomplet peut devenir une séance « terminée »

**Sources :** `app/src/services/tutor/httpSource.ts:27` ; `app/src/engine/player.ts`, fin de `loop()`.

Le client ne vérifie pas le statut HTTP ni le type de contenu. Les lignes non JSON et les événements invalides sont ignorés, et la fermeture du corps suffit au lecteur pour conclure. Une réponse HTML 502 produit ainsi `done` sans erreur. Un corps contenant une étape mais aucun événement terminal produit le même résultat.

**Reproductions :** réponse HTML 502 ; réponse NDJSON fermée après une étape sans `end`, `await` ou `error`.

**Correction :** vérifier le statut et le format dans l'adaptateur HTTP, conserver les erreurs NDJSON valides des routes, puis signaler une fin de flux sans événement terminal. Ne pas pousser la connaissance des statuts HTTP dans l'interface.

### 4. P2 — Les identifiants de secours peuvent écraser les objets du tour précédent

**Sources :** `app/src/domain/tutor/modelOutput.ts:45` ; `app/src/server/tutor/service.ts:175` ; `app/src/domain/board/state.ts`, `putNode()`.

Chaque nouvelle instance du parseur repart de `autoId = 0`. Le service en crée une par génération, y compris pour la réparation d'un tour. Deux points sans identifiant deviennent tous deux `point1`. Comme le tableau conserve ses objets entre les tours et remplace un objet portant le même identifiant, le nouveau point peut écraser le précédent.

**Reproduction :** deux instances successives du parseur attribuent `point1` aux deux points.

**Correction :** injecter un générateur/ensemble d'identifiants occupés ou un préfixe unique de génération ; partager cette allocation lors d'une réparation. Garder le parseur indépendant du réseau et de React.

### 5. P2 — L'annulation du micro ne couvre pas l'attente de permission

**Source :** `app/src/services/voice/voiceInput.ts:62–118`.

`cancel()` ne peut agir qu'après l'installation de `stopRecording`, donc après la résolution de `getUserMedia()`. Si l'élève quitte l'écran pendant la demande de permission puis accepte celle-ci, l'enregistrement démarre encore et les pistes ne sont pas arrêtées par l'annulation précédente. La transcription en cours n'est pas non plus annulée et ses callbacks ne sont pas invalidés.

**Reproduction :** démarrage, annulation avant l'accord de permission, accord ensuite ; aucune piste n'est arrêtée et le traitement poursuit son démarrage.

**Correction :** invalider chaque acquisition avec un identifiant d'opération ; arrêter immédiatement un flux arrivé trop tard ; annuler le fetch de transcription et ignorer les anciens callbacks. Cette responsabilité appartient au service du micro, le hook ne faisant que l'utiliser.

### 6. P2 — Les erreurs du tuteur sont enregistrées comme des tours complets

**Source :** `app/src/server/tutor/recording.ts:15–24`.

`tutorEvents()` transforme les erreurs en événements `kind: "error"`. `withRecording()` ne considère comme erreur que les exceptions levées. Un événement d'erreur consommé normalement aboutit donc à `recorder.finish("complete")`. Les statistiques d'interruption et d'échec deviennent inexactes.

**Reproduction :** un flux contenant un événement `error` termine avec `complete`.

**Correction :** suivre les événements d'erreur dans le décorateur d'enregistrement, en conservant la distinction entre erreur, fin normale et annulation.

### 7. P3 — Le formulaire historique du site est devenu inaccessible

**Sources :** `index.html:838`, `:1084`, `:1119` ; mêmes blocs dans `en.html`.

Tous les boutons « Essayer » ouvrent directement `https://app.nesalio.com/`. Aucun élément de ces pages ne porte plus `data-open`. Le dialogue, ses trois étapes, ses variantes `PLANS`, sa référence d'inscription et son envoi Formspree restent livrés, mais le visiteur ne peut plus ouvrir ce parcours.

**Correction :** retirer le HTML, le CSS et les traitements de l'ancien parcours, puis régénérer l'anglais. **Ne pas retirer toute la fonction englobante telle quelle** : elle contient encore le gestionnaire des clics `data-track`, la barre fixe mobile et l'habillage de navigation, qui restent actifs. Extraire ces responsabilités avant le nettoyage.

### 8. P2 — Les événements de conversion ne sont pas persistés dans la configuration livrée

**Sources :** `index.html:952–965`, `:1121` ; mêmes lignes dans `en.html` ; `LISEZMOI.md` annonce la mesure des événements `essayer_*`.

`POSTHOG_KEY` est vide. `nTrack()` alimente un tableau en mémoire et le champ caché de l'ancien formulaire ; il ne transmet à un service que si `posthog.capture` existe. Avec les scripts livrés, ce service n'est pas initialisé et le formulaire n'est plus soumis. Les clics directs vers l'application ne sont donc pas persistés par ce mécanisme. Le script Vercel présent reçoit les visites ; ce code ne lui transmet aucun événement `essayer_*`.

**Correction :** raccorder explicitement les événements à l'outil de mesure retenu et vérifier un clic jusqu'à sa réception. Séparer la mesure du formulaire historique.

## Bilan module par module

« Sain » signifie qu'aucun défaut concret n'a été identifié dans les chemins examinés, pas une garantie absolue.

| Module | Solidité | Maintenabilité | Responsabilité / décision |
|---|---|---|---|
| `domain/math/expr.ts` | Sain : grammaire bornée, sans `eval`, tests dédiés | Bonne | Bien dans le domaine ; conserver le parseur commun aux tracés et vérifications. |
| `domain/scene/primitives.ts`, `schema.ts` | Contrats explicites, bornes et validation à plusieurs frontières | Bonne | Bien placés ; garder la validation avant le moteur et le rendu. |
| `domain/scene/commands/index.ts`, `define.ts` | Registre cohérent | Moyenne : registre, union Zod et `NODE_COMMANDS` nécessitent plusieurs mises à jour | Conserver les commandes dans le domaine ; ajouter une vérification de cohérence des trois listes avant de multiplier les commandes. |
| Commandes `figure`, `points`, `analysis`, `linear`, `steps`, `areaModel` | Géométrie pure et fonctionnalités testées | Bonne dans l'ensemble | Bien placées. Import de type inutilisé dans `linear`. |
| Commandes `shapes`, `solids`, `conics`, `trigCircle` | Plusieurs tests utiles ; pas de défaut concret retenu ici | `shapes.ts` concentre 613 lignes | Conserver les règles mathématiques ici ; extraire les constructeurs de formes si ce module continue de grossir. |
| Commandes `constructions`, `images`, `vectors`, `parts` | Sain dans les chemins examinés | Bonne séparation des transformations et du placement | Bien placées ; supprimer l'import inutilisé dans `constructions`. |
| Commandes `motion`, `emphasis`, `structure`, `camera`, `text` | État et animation décrits sans dépendance à Manim | Moyenne pour `motion` | Garder les effets sur l'état dans le domaine ; le rendu continue à ne lire que des nœuds. |
| `domain/board/state.ts` | Modèle pur, historique de mouvement borné, purge des objets effacés | Bonne | Bien placé ; l'état de plusieurs zones pourrait devenir un module voisin plutôt qu'une responsabilité privée de `Player`. |
| `domain/board/layout.ts` | Géométrie et placement partagés avec le rendu | Fragile à faire évoluer : **878 lignes**, métriques de texte, graduations, boîtes, empreintes, placement, colonne de calculs | Rester dans le domaine ; découper par ces responsabilités. Les dimensions graphiques ne justifient pas un déplacement vers React. |
| `domain/board/geometry`, `shapes`, `steps`, `tex` | Fonctions pures, tests de cas mathématiques et de formules | Bonne | Conserver. `stepValue` n'a que des consommateurs de test : décider si cette API est encore utile. |
| `domain/board/collisions`, `apart`, `free`, `room` | Réutilisation réelle par commandes et analyse | Bonne | Bien dans le domaine ; conserver les heuristiques de placement en dehors du renderer. |
| `domain/board/zones.ts` | Constantes et contrat communs | Bonne | Bon emplacement ; éviter de recopier les règles de conservation entre serveur et lecteur. |
| `domain/tutor/modelOutput.ts`, `ndjson.ts` | Tolérance utile aux sorties imparfaites ; défaut d'identifiants et protocole client incomplet | Moyenne : normalisation, réparation syntaxique et validation se côtoient | Corriger les identifiants ; séparer le scanner JSON des politiques de normalisation si nécessaire. |
| `domain/tutor/assessment`, `learning`, `progress`, `plan` | Bonnes distinctions entre présentation, observation et réussite ; arithmétique exacte bornée ; plan sans cycle | Bonne | Bien dans le domaine. Les déclarations du modèle et la mémoire fournie par le client ne deviennent pas des preuves de maîtrise. |
| `domain/tutor/teachingPolicy`, `controller` | Décisions testables et séparées des prompts | Bonne, mais règles textuelles à maintenir avec leurs contre-exemples | Conserver les décisions déterministes ici et leur formulation dans les prompts serveur. |
| `domain/tutor/cues`, `talkShow`, `turnReview` | Analyse indépendante du fournisseur et du navigateur | Bonne | Bien placés et réellement utilisés par le lecteur/diagnostic. |
| `domain/timeline/*`, `domain/audio/speechSpan.ts` | Planification pure, synchronisation et estimation testées | Bonne | Conserver. L'estimation vocale reste distincte d'un alignement mot à mot mesuré. |
| `engine/ports.ts` | Contrats injectables, horloge annulable | Bonne | Bonne frontière ; le contrat vocal doit garantir une terminaison en cas d'échec. |
| `engine/player.ts` | Tests nombreux, mais réponse perdue et attente vocale infinie reproduites | **À alléger : 789 lignes**, tours, interruptions, zones, apprentissage, contexte et rejeu | Garder l'orchestration ici ; extraire l'état des zones vers `domain/board` et l'historique/contexte dans des collaborateurs du moteur. Ne pas déplacer ces règles dans l'UI. |
| `server/tutor/service.ts` | Validation, limite de tours et réparation bornée sont de bons garde-fous | Bonne, avec suivi des identifiants à consolider | Bon emplacement pour l'orchestration du fournisseur ; conserver le contrôleur dans le domaine. |
| `server/tutor/prompt.ts`, `domains/*` | Exemples et consignes alimentés par le registre | Moyenne : **508 lignes** et plusieurs sortes d'exemples | Extraire persona, contrat et exemples dans des fichiers serveur distincts ; garder les consignes métier par domaine. |
| `server/tutor/chatCompletions.ts` | Vérifie notamment les fins de flux SSE et les limites de jetons | Bonne | Adaptateur fournisseur bien placé ; les délais explicites et la libération/annulation des lectures méritent un contrat commun. |
| `server/config.ts`, `server/ai/audio.ts`, `syncMeasure.ts` | Configuration injectable, appels et décodage audio testables | Bonne | Garder le transport au serveur. Déplacer `UpstreamError`/`isUnavailable` dans un petit module d'erreurs IA commun pour éviter aux routes audio d'importer tout le service tuteur. |
| `server/account`, `authConfig`, `adminAccess`, `proxy` | Vérifications au niveau des opérations, refus sans configuration, tests d'accès | Bonne | Emplacement correct ; les pages composent l'accès et les routes gardent leur propre contrôle. L'authentification réelle n'a pas été rejouée dans cette revue. |
| `server/http.ts`, `rateLimit.ts` | Lecture réellement bornée ; quotas utilisateur et IP | Bonne pour un prototype | Bien placés. Les compteurs sont locaux à chaque instance : ils ne constituent pas un quota global entre instances. |
| `server/sessionStore.ts`, `domain/sessionLog.ts`, `tutor/recording.ts` | Ports de stockage utiles ; erreurs d'événements mal classées | Bonne séparation domaine/stockage | Corriger le classement des tours ; conserver le magasin hors du domaine. |
| Routes `tutor`, `voice`, `transcribe` | Authentification et limites au bon endroit | Bonne | Garder les routes minces ; corriger le protocole côté client et les annulations dans les adaptateurs. |
| Routes `feedback`, `apres-essai`, `server/forms.ts` | Schémas, authentification et timeout d'envoi | Bonne | Bonne séparation entre contrat, transport et UI ; ne pas confondre ces formulaires actifs avec le formulaire mort de la vitrine. |
| Routes `status`, `diagnostic`, `seances`, `purge` | Contrôles administratifs explicites ; outils utiles | Moyenne pour la route diagnostic plus volumineuse | Bien au serveur ; extraire le scénario de diagnostic de la route si ses responsabilités augmentent. |
| `services/tutor/httpSource.ts` | **À corriger** : erreur HTTP et flux tronqué avalés | Simple et récupérable | Bon emplacement ; c'est la frontière de validation du protocole réseau. |
| `services/voice/cloudSpeaker.ts` | **À corriger** : chargement sans délai maximal ; nettoyage des ressources incomplet | Moyenne | Réseau, cache audio, mesure et lecture sont à séparer ; ajouter une destruction explicite des URLs et requêtes. |
| `services/voice/voiceInput.ts`, `speechListener.ts` | **À corriger** : annulation et callbacks tardifs | Moyenne : acquisition, enregistrement, silence et transcription mélangés | Garder ici, avec cycle de vie explicite. Distinguer aussi annuler de terminer une reconnaissance navigateur. |
| `services/voice/browserSpeaker.ts` | Repli et délais de sécurité présents | Bonne, nettoyage à compléter | Prévoir une destruction qui détache `voiceschanged` ; `cancel()` seul n'est pas un cycle de vie complet. |
| `services/session.ts`, `domain/session.ts`, contrats `feedback`, `afterTrial` | Formats bornés, identifiants sans dépendance au compte | Bonne | Bonne séparation formats/adaptateur navigateur ; documenter clairement la différence entre session de page et compte. |
| `ui/hooks/useTutor`, `useVoiceInput`, `useFrameClock` | Assemblage et abonnements courts | Bonne si les services garantissent leur destruction | Garder les hooks comme adaptateurs React ; le correctif d'annulation doit d'abord être dans le service. |
| `ui/TutorApp`, `Dock`, `QuestionInput`, `MicButton`, `StartScreen` | Composition claire, peu de logique métier | Bonne ; `Dock` est le principal composant à surveiller | Emplacements corrects ; les défauts de séance ne se corrigent pas avec des conditions supplémentaires dans les composants. |
| `ui/board/ManimBoard`, `LessonBoard`, `DiagnosticTag` | Gestion du montage/démontage et séparation par zones | Bonne | Bien dans l'UI ; compléter la vérification graphique des transitions et du cycle de vie. |
| `ui/board/manim/ManimRenderer.ts`, `camera.ts` | Calculs caméra testés ; renderer central peu protégé par tests ciblés | **Principal point de concentration : 996 lignes** dans le renderer | Garder la projection Manim dans l'UI ; extraire construction des objets, planification des animations et interactions caméra. |
| `ui/Feedback`, `AfterTrial`, `TopBar`, `Account*`, `Nesa`, `Caption`, `theme` | Responsabilités visuelles identifiables | Bonne | Bien placés ; retirer `FONTS` inutilisé ou en faire réellement la référence commune. |
| `content/demoLessons.ts` | Contrat commun avec les sorties du modèle ; utilisé par démo et exemples | Bonne | Bien dans le contenu ; conserver les commandes mathématiques dans le domaine. |
| `index.html`, `en.html` | Parcours direct actif ; ancien formulaire mort et mesure non persistée | Moyenne : HTML, styles et plusieurs comportements dans le même fichier | Retirer le parcours obsolète et séparer mesure, navigation et formulaires ; conserver une source anglaise générée. |
| `nesa.js`, `app/public/nesa.js`, `mascotte.html` | Composant réutilisé ; interruption des animations hors écran et au démontage | Bonne ; copies actuellement identiques par SHA-256 | Garder une source commune et automatiser sa copie plutôt que maintenir deux versions manuellement. |
| `tools/make_en.py`, `notions.py`, `articles.py`, `articles_content.py` | Générateurs utiles ; l'anglais refuse les remplacements devenus introuvables | Moyenne : dépendance à des fragments HTML exacts | Bons outils hors runtime ; à terme, séparer textes et gabarits. |
| `tools/build-site.cjs`, configurations de publication | Liste explicite des seuls fichiers publics ; sources et analyses exclues | Bonne, liste à maintenir à chaque ajout public | Bon emplacement ; garder la sortie de publication séparée du dépôt de travail. |
| `app/tools/e2e`, `eval`, `scenarios`, `analyse`, `rejeu` | Outillage utile, mais scénario E2E documenté antérieur à l'obligation de compte | Moyenne | Adapter l'E2E à une session authentifiée ou une démonstration locale autorisée : `DISABLE_AI=1 npm start` ne contourne pas le contrôle de compte en production. |

## Code inutilisé : éléments vérifiés

- **Parcours mort significatif :** dialogue de la vitrine et traitements de ses trois étapes, présents dans les deux langues, sans déclencheur accessible.
- **Valeur sans consommateur identifié :** `FONTS` dans `app/src/ui/theme.ts:31`.
- **Types sans consommateur identifié :** `NodeType`, `FeedbackContext`, `StepEventT`, `DiagnosisEventT`. Ils n'ont pas de coût d'exécution, mais élargissent inutilement l'API publique des modules.
- **Exports consommés seulement par les tests :** `stepValue`, `numericValue`, `serializeLesson`. Ce ne sont pas des modules morts : leur statut doit être explicite, et les helpers de fixtures peuvent rejoindre les tests. Ne pas supprimer leurs tests sans conserver la vérification du comportement public utile.
- **Imports inutilisés confirmés par TypeScript :** les deux signalés plus haut.
- `useFrameClock`, les calculs de collisions, les modules de commandes et les démos ont des usages réels. Leur suppression ne serait pas justifiée.

## Ordre de travail conseillé

1. Corriger l'attente vocale infinie et les transitions de tour ; reprendre les reproductions correspondantes dans la suite applicative.
2. Corriger le contrat HTTP, l'annulation du micro et l'allocation d'identifiants.
3. Corriger le statut des enregistrements et vérifier la réception réelle des événements de conversion.
4. Retirer le formulaire historique, ses styles et les déclarations inutilisées, en préservant mesure et navigation actives.
5. Alléger progressivement `Player`, `layout`, `ManimRenderer` et les prompts en conservant les frontières actuelles. Le nombre de lignes est un indicateur de concentration, pas à lui seul un défaut fonctionnel.
6. Actualiser l'E2E avec comptes, puis vérifier la voix et les transitions graphiques dans un navigateur.

Les captures d'analyse archivées, les vidéos et le runtime REA de développement ne sont pas des modules du site public ; ils ne sont pas assimilés à du code mort applicatif dans cette revue.

## Reproduire les vérifications ciblées

Depuis `app/` :

```powershell
npm test -- --config ../analyses/revue-modules-2026-11-04/vitest.config.mjs --reporter=verbose
```

Les sept échecs sont attendus tant que les six défauts fonctionnels ne sont pas corrigés. Le détail est conservé dans `reproductions-output.txt`. Les deux observations concernant la vitrine reposent sur la lecture de ses déclencheurs et de son mécanisme de mesure.

Depuis la racine :

```powershell
node analyses/revue-modules-2026-11-04/inventory.cjs
```

`inventory.json` contient les fichiers, dépendances, consommateurs, tailles et candidats d'exports inutilisés. Les candidats ont ensuite été confrontés aux références dans les tests et outils ; ils ne constituent pas une liste à supprimer automatiquement.
