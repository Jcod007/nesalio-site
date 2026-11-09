# Revue des tests — 6 novembre 2026

## Périmètre et résultat

Inventaire des 50 fichiers `app/src/**/*.test.ts` inclus dans Vitest, de la reproduction d'audit séparée et des outils navigateur et d'évaluation. Examen des noms et assertions, approfondi sur les contrats pédagogiques, les parcours et les échecs reproduits. Cette revue n'est pas une preuve exhaustive de l'efficacité de chaque assertion ni une mesure de couverture ou une campagne de mutation.

- `npm test` : 50 fichiers, 478 tests réussis.
- Suite séparée `npm test -- --config ../analyses/revue-modules-2026-11-04/vitest.config.mjs --reporter=dot` : 1 réussite, 6 échecs (7 tests). La réponse anticipée, corrigée juste avant cette revue, réussit désormais.
- Les scripts navigateur et les évaluations du vrai modèle n'ont pas été exécutés pour cette revue. Ils exigent un serveur et, pour le modèle, une configuration et des appels externes.

## Constats prioritaires

1. **La suite verte ne couvre pas des défaillances de séance connues.** Les six reproductions encore en échec couvrent : erreur enregistrée comme succès, HTTP 502 et flux tronqué présentés comme terminés, identifiants de secours réutilisés, permission micro arrivée après annulation, requête vocale bloquée. Deux échecs concernent le même défaut de protocole. Le test d'identifiants exerce directement deux parseurs ; compléter par un test de deux tours sur le même tableau pour vérifier la conséquence observable. Ces reproductions sont hors de `src/**/*.test.ts` et donc hors de `npm test`.
2. **Les règles pédagogiques sont testées, pas leur efficacité.** Le contrôleur accepte par exemple une étape générique annotée `transfer` : la présence de l'étiquette ne prouve pas un transfert. Deux réussites guidées déclenchent une proposition d'autonomie parce que c'est la règle fixée ; le test ne prouve pas que deux suffisent. Il faut valider les seuils et les contenus avec des enseignants et des résultats d'élèves, sans présenter une annotation comme une preuve.
3. **Le modèle réel est peu évalué par les tests unitaires.** Les tests du prompt contrôlent surtout des fragments de texte, et le service reçoit des sorties fabriquées. Ils protègent le contrat et les réparations, pas la vérité mathématique ni l'adéquation de la remédiation. L'E2E pédagogique intercepte `/api/tutor` et fabrique les tours ; il teste l'interface et la mémoire, pas la génération.
4. **Le banc d'évaluation peut manquer du texte affiché.** `tools/eval/evaluer.mjs:37` joint des objets de commandes et de questions avec des chaînes : ces objets deviennent `[object Object]`. Les critères de présence ou d'absence peuvent donc ignorer leurs contenus et signaler à tort un manque ou une absence. Le banc cherche aussi des expressions textuelles : même corrigé, un mot présent ne prouve ni une réponse exacte ni une explication correcte, et une notation équivalente peut être rejetée. La réponse HTTP n'est pas contrôlée explicitement avant lecture JSON.
5. **Le rendu observé n'est pas le rendu réel.** Plusieurs tests de collisions utilisent le détecteur du projet comme oracle pour la disposition du projet. C'est utile, mais les deux peuvent partager une erreur de mesure. Le test navigateur compte un canvas, ce qui ne garantit pas qu'il contient un dessin lisible ; il utilise une attente fixe de six secondes. Ajouter quelques vérifications visuelles indépendantes et vérifier les états réellement visibles sur téléphone.
6. **Les tests du langage restent fragiles face aux formulations inédites.** `teachingPolicy.test.ts` contient des variantes intéressantes, mais un ensemble d'exemples positifs ne mesure ni les faux positifs ni la robustesse à des formulations nouvelles. Constituer un corpus indépendant avec négations, demandes contradictoires, erreurs d'orthographe et formulations québécoises, classées par résultat attendu.

## Lecture fichier par fichier

Les appréciations suivantes indiquent ce que chaque fichier protège et une limite ou prochaine question à examiner ; elles ne signifient pas que chaque fichier nécessite plus de tests.

### Domaine pédagogique

- `domain/tutor/assessment.test.ts` — Bon oracle numérique exact, cas ambigus et bornes. À étendre seulement aux contrats mathématiques nouveaux ; ne vérifie pas la traduction entre énoncé et expression.
- `domain/tutor/controller.test.ts` — Vérifie priorités, remédiation et refus structurels. Les étapes fictives et étiquettes ne garantissent ni qualité de l'aide ni véritable transfert ; examiner des séances complètes annotées par des enseignants.
- `domain/tutor/cues.test.ts` — Protège la synchronisation entre mots et objets. Tester aussi l'effet rendu et les objets absents dans un parcours réel.
- `domain/tutor/learning.test.ts` — Distinction utile présentation/observation, bornes et immutabilité. Compléter avec séquences longues et interruptions croisées si ces comportements évoluent.
- `domain/tutor/modelOutput.test.ts` — Cas utiles de JSON incomplet et de normalisation. Tester le cycle de vie des identifiants sur plusieurs tours et réparations, pas uniquement un parseur isolé.
- `domain/tutor/plan.test.ts` — Graphes valides et invalides, partage de prérequis et limites. Vérifie la cohérence structurelle, pas la pertinence des prérequis proposés.
- `domain/tutor/progress.test.ts` — Protège la provenance, les doublons et les dates ; les seuils sont des choix produit. Les exemples A/B ne démontrent pas que des tâches sont pédagogiquement distinctes.
- `domain/tutor/talkShow.test.ts` — Indicateurs de lien parole/tableau ; les métriques de quantité ne démontrent pas que le dessin aide à comprendre.
- `domain/tutor/teachingPolicy.test.ts` — Large éventail de formulations et de priorités ; ajouter un corpus tenu à part et des contre-exemples proches pour mesurer les erreurs de classification.
- `domain/tutor/turnReview.test.ts` — Vérifie quelques écarts entre annonce et dessin ; la détection reste limitée aux formes reconnues, sans validation sémantique générale.

### Tableau, mathématiques et scène

- `domain/board/apart.test.ts` — Vérifie des transformations d'éloignement ; contrôler les invariants géométriques et la lisibilité rendue sur des cas représentatifs.
- `domain/board/collisions.test.ts` — Scénarios concrets et contraintes de distance ; détecteur et placement partagent les calculs internes, donc compléter par une observation visuelle indépendante.
- `domain/board/geometry.test.ts` — Couvre asymptotes, bornes et graduations ; ajouter des exemples de discontinuités difficiles si le traceur les prend en charge.
- `domain/board/state.test.ts` — Bonne variété de cycles de vie des objets et transformations ; les états internes ne garantissent pas un affichage correct ou une animation correcte.
- `domain/board/steps.test.ts` — Cas mathématiques précis, b négatif et changements de paramètres ; compléter par une vérification visuelle des points ouverts/fermés.
- `domain/board/tex.test.ts` — Séparation et représentation textuelle utiles ; vérifier à l'écran les formules longues et la sortie accessible.
- `domain/math/expr.test.ts` — Priorités, fonctions, Unicode et rejet du code ; oracle utile, mais quelques exemples ne couvrent pas toute la grammaire. Des propriétés et valeurs limites indépendantes seraient utiles si elle s'étend.
- `domain/scene/commands/analytic.test.ts` — Résultats géométriques ciblés ; ajouter des invariants indépendants aux cas étendus.
- `domain/scene/commands/constructions.test.ts` — Relations, noms et constructions testés ; distinguer exactitude mathématique et visibilité effective des éléments.
- `domain/scene/commands/images.test.ts` — Large éventail et contrôle positif du détecteur de chevauchement ; la validation visuelle reste nécessaire pour des tailles d'écran réelles.
- `domain/scene/commands/shapes.test.ts` — Nombreux cas géométriques et limites ; compléter par quelques vérifications d'affichage plutôt que multiplier les cas internes similaires.
- `domain/scene/commands/solids.test.ts` — Nombre d'arêtes et géométrie de base ; ne prouve pas que la perspective et les traits cachés sont compréhensibles à l'écran.

### Temps, audio et séance

- `domain/audio/speechSpan.test.ts` — Échantillons synthétiques et cas sans voix ; ils ne représentent pas à eux seuls le bruit réel, les voix faibles ou les formats.
- `domain/sessionLog.test.ts` — Bonne couverture des copies, statuts et rétention ; la précision des données dépend aussi du décorateur d'enregistrement.
- `domain/timeline/plan.test.ts` — Ordonnancement et durées ; horloge synthétique, à compléter par un parcours réel si la synchronisation est critique.
- `domain/timeline/spokenTime.test.ts` — Répartition et données incohérentes ; ne mesure pas le décalage perçu en audio réel.
- `domain/timeline/syncCheck.test.ts` — Algorithme de correspondance et erreurs de mots ; les mesures estimées ne remplacent pas l'écoute.
- `engine/player.test.ts` — Bons scénarios de réponse, mémoire, interruption et progression ; beaucoup de dépendances simulées. Le cas de réponse avant `await` ajouté récemment protège une course réelle ; poursuivre avec flux interrompu et annulations réels/simulés.
- `services/session.test.ts` — Durée de l'identifiant et référence ; ne vérifie pas les interactions entre plusieurs onglets ou les politiques de stockage navigateur.
- `services/voice/cloudSpeaker.test.ts` — Trois tests de métadonnées, aucun pour une requête qui ne termine pas, erreur de lecture ou annulation. L'audit reproduit effectivement le blocage.
- `ui/board/manim/camera.test.ts` — Calculs de caméra et zoom utiles ; ne teste ni WebGL, ni rendu de texte, ni interactions réelles.

### Serveur et routes

- `app/api/apres-essai/route.test.ts` — Contrat du formulaire et choix invalide ; transport simulé et seulement quelques cas limites.
- `app/api/feedback/route.test.ts` — Transmission, erreur et données de séance ; ne prouve pas la réception réelle par le prestataire.
- `app/api/tutor/route.test.ts` — Format NDJSON de démo, taille UTF-8 et quota ; authentification et configuration IA simulées, donc pas une séance complète avec modèle.
- `app/dev/access/route.test.ts` — Cookie et lien ; ne remplace pas un parcours de connexion réel.
- `server/account.test.ts` — Tests importants de refus, origine et identité vérifiée ; doubles de fournisseur, pas validation d'une connexion Clerk réelle.
- `server/accountRoutes.test.ts` — Bon contrôle transversal de refus anonyme sur cinq routes ; ne couvre pas à lui seul les opérations autorisées ni tous les droits administratifs.
- `server/adminAccess.test.ts` — Cas de secret absent, erroné et valide ; couverture volontairement ciblée.
- `server/ai/audio.test.ts` — Décodage et formats simulés ; les formats réels et erreurs fournisseur demandent des fixtures représentatives.
- `server/ai/syncMeasure.test.ts` — Orchestration et cas sans horodatage ; dépend de transcriptions simulées, ne valide pas la qualité réelle du son.
- `server/config.test.ts` — Priorité des fournisseurs et modes ; contrôler l'intégration dans l'environnement effectivement déployé séparément.
- `server/devAccess.test.ts` — Secret et révocation ; ces tests ne valident pas seuls toutes les restrictions de déploiement.
- `server/forms.test.ts` — Régression ciblée Formspree ; pas de garantie de livraison externe.
- `server/http.test.ts` — Bonnes limites en octets, Unicode découpé et annulation ; tester les frontières réseau supplémentaires seulement si le contrat change.
- `server/rateLimit.test.ts` — Isolation, plafond IP et cas sans session ; compteur local, donc pas de preuve de quota partagé entre instances.
- `server/sessionStore.test.ts` — Stockage privé et suppression simulés ; ne démontre pas le comportement du stockage distant ni la configuration de production.
- `server/tutor/domains/sn4.test.ts` — Vérifie consignes et commandes propres au programme ; ne suffit pas à certifier la correction mathématique des sorties du modèle.
- `server/tutor/prompt.test.ts` — Protège la présence de consignes, les frontières système/utilisateur et certains exemples exécutables. Les recherches de chaînes sont sensibles à la formulation et ne prouvent pas que le modèle obéit.
- `server/tutor/recording.test.ts` — Exceptions et annulations vérifiées ; manque un événement `error` émis sans exception, reproduit en échec dans la suite d'audit.
- `server/tutor/service.test.ts` — Nombreux tests utiles de réparation bornée et de flux artificiels ; ajouter des fixtures réalistes et malveillantes, sans confondre validation de protocole et qualité du contenu.

### Tests et évaluations hors suite principale

- `analyses/revue-modules-2026-11-04/reproductions.test.ts` — Sept tests fondés sur des conséquences attendues ; six échouent actuellement. Les faire rejoindre la suite principale au fur et à mesure des corrections ; adapter le test d'identifiants au tableau complet.
- `tools/e2e/parcours.mjs` — Vérifie accueil, tailles et violations axe sérieuses sur deux résolutions ; compter un canvas ne vérifie pas son contenu, l'attente fixe est fragile et l'authentification actuelle peut rendre le mode d'emploi obsolète.
- `tools/e2e/pedagogie.mjs` — Vérifie utilement interface, mémoire et réponse libre sur deux écrans. Intercepte les API : aucune conclusion sur la vraie IA ou sa qualité pédagogique.
- `tools/eval/evaluer.mjs` et jeux `questions*.json` — Couvrent plusieurs notions et des critères de programme ; corriger l'extraction des objets, tester le banc lui-même, et distinguer indicateurs textuels et jugement humain. Le jeu général n'impose pas de critère de correction par question.
- `tools/scenarios/jouer.mjs` — Outil de scénarios à considérer comme exploration, pas comme preuve automatique de qualité sans oracle indépendant et critères explicites.

## Questions de test à poser en priorité

1. Après une réponse incorrecte ou « je ne sais pas », l'élève reçoit-il une aide adaptée à son erreur, puis une tâche possible sans que la réponse lui soit donnée ?
2. Les calculs, hypothèses et relations du dessin sont-ils justes et cohérents avec les paroles ? Qui valide l'oracle ?
3. Deux réussites représentent-elles des tâches suffisamment distinctes et sans aide pour justifier la prochaine étape ?
4. L'élève peut-il interrompre, refuser une question, demander un exemple ou changer d'objectif sans perdre le contexte pertinent ?
5. Quand réseau, voix ou micro échouent, la séance informe-t-elle l'élève et permet-elle de reprendre ?
6. Après la séance, un exercice nouveau et, si possible, un rappel différé montrent-ils une amélioration ? Une telle évaluation nécessite des participants, une comparaison et des précautions de mesure ; les tests logiciels ne l'établissent pas.

## Ordre proposé

Corriger les défaillances reproduites, intégrer leurs tests au filet habituel, réparer et tester l'extraction du banc d'évaluation, puis construire un petit jeu de conversations réalistes à juger avec une grille indépendante : exactitude, diagnostic, aide, cohérence dessin/parole, respect des préférences et exercice nouveau. Comparer plusieurs exécutions de chaque version ; faire examiner un échantillon par des enseignants. Garder séparées conformité logicielle, qualité des sorties et mesure d'apprentissage.
