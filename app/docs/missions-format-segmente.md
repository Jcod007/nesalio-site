# Missions de programmation : étapes vocales segmentées

## Objectif et périmètre

Ajouter, en parallèle du format actuel `say`/`do` et de ses repères `{id}`, un format qui associe explicitement des phrases courtes aux actions de tableau. Le moteur existant de commandes, la géométrie, le placement et le rendu Manim restent les sources de vérité. Ne pas supprimer ni convertir les anciennes séances. Le nouveau format ne devient pas la sortie par défaut avant validation des critères de la mission 8.

Ce document conserve le plan de travail initial et les critères de validation. Le tuteur utilise désormais `segments` pour toutes les nouvelles réponses. Les passages qui décrivent les deux modes et leur activation documentent la phase de comparaison. La validation des cibles reste partielle lorsque le serveur ne dispose que d'un résumé du tableau.

## Contrat cible

Chaque événement `step` est soit historique, soit segmenté. Une étape segmentée contient `segments` et ne contient pas de `say`, `do` ou `cues` à sa racine. Les propriétés `zone`, `practiceBoard`, `mood`, `check` et `teaching` restent au niveau de l'étape et conservent leur sens actuel. `check` intervient après le dernier segment achevé ; une annotation de présentation n'est comptée qu'après l'étape entière.

```json
{
  "kind": "step",
  "zone": "example",
  "mood": "dessine",
  "segments": [
    {
      "say": "Voici un triangle rectangle.",
      "do": [{"type":"triangle","id":"tri","base":4,"height":3,"names":["A","B","C"]}]
    },
    {
      "say": "Son hypoténuse est le côté opposé à l'angle droit.",
      "do": [{"type":"highlight","target":"tri-hyp"}]
    }
  ]
}
```

- Entre 1 et 6 segments par étape ; chaque `say` est non vide après nettoyage et limité à 320 caractères ; au plus 12 actions en tout dans l'étape. `do` manquant équivaut à `[]`.
- Aucun repère `{id}` dans un `say` segmenté : signaler une erreur, sans modifier le texte silencieusement. Les accolades qui ne correspondent pas à la syntaxe d'un repère ne sont pas interdites.
- Les actions d'un segment sont appliquées à l'état dans l'ordre du tableau `do`, avec un début prévu commun au démarrage du segment. Elles peuvent s'animer en parallèle ; si une action doit attendre visuellement une autre, le modèle doit les mettre dans des segments distincts. Par exemple, créer `tri` puis mettre `tri-hyp` en évidence dans deux segments. Une liste d'actions simultanées n'est pas une preuve automatique d'indépendance visuelle.
- Avant le segment suivant, attendre la fin de l'audio **et** la fin effective des animations correspondantes, ou appliquer un comportement d'échec défini à la mission 5. Le mécanisme actuel attend un délai calculé et le renderer possède sa propre file : il ne faut pas supposer que ce délai prouve la fin effective de l'animation.
- Dans la première version, le contrat ne promet pas une précision au mot, ni une synchronisation parfaite si l'audio ou le rendu est indisponible. En mode muet ou en cas d'échec de voix, conserver le repli existant et un rythme de lecture déterministe.
- Le transport reste NDJSON : chaque événement est sérialisé sur une ligne complète. Ne pas changer les autres types d'événements.

## Mission 1 — Contrats de types et validation

**Dépendances :** aucune. **Livrable :** schémas et types représentant les deux formats sans changer le comportement du lecteur.

- Dans `src/domain/scene/schema.ts`, extraire les champs partagés et définir séparément l'étape historique et l'étape segmentée. Construire les événements `kind: "step"` et les unions de flux sans déclarer deux variantes identiques dans une `discriminatedUnion` Zod. Vérifier aussi les usages de `StepEvent`, `ModelEvent`, `StreamEvent` et `Lesson`.
- Valider les limites ci-dessus et rejeter les formats mixtes même si Zod ignorerait normalement les clés inconnues. Conserver le contrat historique et ses valeurs par défaut. Les autres événements et commandes restent inchangés.
- Ajouter des tests de schéma : chaque variante valide, absence de segments, segments vides, limites, format mixte, repère dans un segment, `check`/`teaching`, anciennes démos et aller-retour de l'événement dans le flux.

**Terminé lorsque :** les deux formes sont reconnues sans ambiguïté ; aucun événement historique valide n'est rejeté ; le typecheck et les tests concernés passent.

## Mission 2 — Accès commun aux étapes et consommateurs

**Dépendances :** mission 1. **Livrable :** fonctions typées pour inspecter les deux formats sans détruire leur ordre ni leur provenance.

- Ajouter un module de helpers, par exemple `src/domain/scene/stepAccess.ts`, avec un discriminateur de format, la liste ordonnée de segments de lecture, l'itération ordonnée des actions et le texte complet. Le texte complet est une vue de lecture, pas une nouvelle source de vérité ; ne pas concaténer les actions pour leur exécution.
- L'ancien format conserve `say`, `do`, `cues` et son chemin de synchronisation. Ne pas le convertir en une partition qui supprimerait ses repères.
- Examiner et adapter explicitement `src/domain/tutor/controller.ts`, `turnReview.ts`, `talkShow.ts`, `src/app/api/diagnostic/route.ts`, `tools/analyse/seances.ts`, `tools/eval/program-check.mjs` et les autres appels trouvés par `rg 'step\.say|step\.do|\.cues'`. Pour chaque métrique, conserver l'unité d'étape actuelle ; parcourir les segments quand il faut analyser leur texte ou leurs actions.
- Tester les helpers et les diagnostics avec les deux formats. Vérifier que `check` et `teaching` ne sont comptés qu'une fois par étape.

**Terminé lorsque :** aucune lecture non protégée de `step.say` ou `step.do` n'oublie la variante segmentée ; aucune régression des métriques historiques n'est introduite.

## Mission 3 — Analyse du modèle et erreurs de contrat

**Dépendances :** missions 1 et 2. **Livrable :** analyseur prenant en charge les deux formes, avec échec explicite pour les actions invalides du nouveau format.

- Adapter `src/domain/tutor/modelOutput.ts`. Détecter le format par `segments`, garder la normalisation actuelle des types de commandes et l'attribution d'ID existante lorsque son comportement reste non ambigu.
- Pour le format segmenté, valider tous les segments avant de produire l'étape : un segment ou une action invalide rejette l'étape entière avec une raison comportant l'indice du segment et de l'action. Ne pas accepter une phrase en supprimant silencieusement son dessin. Les champs pédagogiques et la question doivent aussi être validés avant diffusion.
- Préserver pour le format historique la gestion existante des marqueurs, des corrections et des commandes invalides. Ne pas modifier le protocole externe de façon accidentelle.
- Relier le rejet du nouveau format au contrôle serveur et à sa réparation bornée dans `src/server/tutor/service.ts`. Si aucune réparation n'est possible ou si elle échoue, produire une erreur explicite plutôt que laisser croire que la séance s'est terminée. Les étapes déjà diffusées ne sont pas rétractables ; la réparation ne doit pas les rejouer.
- Tester JSON invalide, commande partiellement invalide, format mixte, alias, ID généré, repères interdits, un échec suivi d'une réparation, réparation impossible et compatibilité historique.

**Terminé lorsque :** une étape segmentée incomplète ne peut pas être diffusée comme si son dessin avait été accepté, et que la réparation existante reste limitée et observable.

## Mission 4 — Dépendances des commandes et zones

**Dépendances :** missions 2 et 3. **Livrable :** validation ordonnée prudente, sans inventer des objets qui n'existent pas.

- Dans `src/server/tutor/service.ts` et `src/domain/tutor/controller.ts`, inspecter les segments dans l'ordre et conserver le suivi des zones, les limites d'actions, l'essai et sa correction.
- Étendre les contrôles de référence à partir des contrats réellement disponibles : objets de la zone active, créations et effacements précédents, constructions et références nécessaires. Distinguer les identifiants de nœuds, de groupes, de sommets et de sous-parties ; les sous-parties comme `tri-hyp` ne sont pas toutes connues simplement en ajoutant l'ID `tri` à un ensemble.
- Ne pas affirmer que les références géométriques sont toutes vérifiées si le serveur ne possède qu'un résumé d'état. Définir des cas déterministes contrôlables et une erreur exploitable ; pour les autres, conserver une validation d'exécution et tracer les échecs plutôt que rejeter des commandes valides par supposition. Ne pas étendre automatiquement la politique du format historique.
- Tester `triangle` puis `highlight tri-hyp`, point nommé puis segment, objet existant issu d'un tour précédent, mauvaise zone, cible absente, effacement puis référence, essai/correction et dépendances entre segments. Vérifier que les segments n'augmentent pas artificiellement le nombre d'étapes du contrôleur.

**Terminé lorsque :** l'ordre et les zones sont respectés ; les contrôles couverts et leurs limites sont documentés ; une référence dont l'existence est réellement inconnue n'est pas présentée comme vérifiée.

## Mission 5 — Lecteur, horloge, rendu et interruptions

**Dépendances :** missions 1 à 4. **Livrable :** lecture segmentée de bout en bout, sans changement de comportement historique.

- Dans `src/engine/player.ts`, conserver le chemin actuel et ajouter un curseur de segment avec un suivi distinct des actions déjà appliquées. Préparer et précharger la voix, sélectionner la zone une seule fois, démarrer l'audio puis les actions, mettre à jour les sous-titres et l'historique, et poser `check` après le dernier segment.
- Appliquer `practiceBoard: attempt/correction` une seule fois par étape. Marquer `teaching.completes` une seule fois, après lecture complète. Adapter `interrupt`, `resume`, `stop`, changement de séance et abandon du flux. À la reprise, rejouer la parole du segment interrompu sans appliquer une seconde fois les actions déjà engagées ; tester les animations déjà terminées et encore en cours.
- Définir une barrière de fin du rendu segmenté : `ManimRenderer` met ses lots en file et `playWithTimestamps` est asynchrone, alors que le Player attend actuellement une durée calculée. Ajouter une interface de fin/annulation corrélée à l'étape et au segment entre Player, `ManimBoard` et renderer, ou une abstraction équivalente testable. La fin signalée doit couvrir le lot concerné, y compris l'attente dans la file ; elle ne doit pas résoudre une nouvelle séance à la place de l'ancienne.
- En cas de rendu indisponible, d'animation échouée ou de démontage, ne jamais bloquer la séance : remonter un état d'échec observable, annuler les attentes périmées et utiliser un délai de secours borné. Garder les replis vocaux existants et respecter l'annulation. Le délai de secours n'est pas une garantie de fin effective.
- Ne pas changer la géométrie et le placement pour ce chantier. Tester avec une fausse horloge, une fausse voix et un faux rendu contrôlable : démarrage parallèle, file en retard, fin audio avant dessin et inversement, échec, pause/reprise, changement de séance, silence, sous-titres et question.

**Terminé lorsque :** aucun segment suivant ne démarre avant l'achèvement du lot attendu dans le cas normal ; les erreurs ne bloquent pas indéfiniment ; les tests historiques de lecture restent verts.

## Mission 6 — Instructions au modèle et activation contrôlée

**Dépendances :** missions 1 à 5. **Livrable :** possibilité explicite d'émettre le nouveau format sans l'imposer à tous.

- Dans `src/server/tutor/prompt.ts`, ajouter les consignes et exemples segmentés : triangle, puis mise en évidence ; axes et courbe ; question de fin. Décrire l'ordre, la simultanéité, les limites et l'interdiction des marqueurs dans ce format. Réutiliser la documentation générée des commandes existantes.
- Ajouter un choix de format de génération côté serveur, par configuration explicite, avec ancien format comme valeur par défaut pendant l'expérimentation. La validation et la lecture acceptent les deux formats quel que soit ce choix. Ne pas exposer inutilement ce réglage dans l'interface élève.
- Vérifier que le modèle n'émet pas d'étape mélangeant les deux formats et que la réparation redemande le format choisi sans répéter les étapes déjà transmises. Préserver les exemples et démonstrations historiques.
- Tester prompt, option par défaut et option segmentée, transport NDJSON, envoi progressif et repli vers le format historique.

**Terminé lorsque :** l'activation peut être contrôlée et désactivée sans migration des séances, et les deux formes circulent de bout en bout.

## Mission 7 — Séances, relecture et évaluations

**Dépendances :** missions 2 à 6. **Livrable :** enregistrements et outils compatibles avec les deux formats.

- Vérifier `src/server/tutor/recording.ts`, `src/domain/sessionLog.ts`, la création de retranscriptions dans `player.ts`, l'outil de relecture et les scripts d'analyse et d'évaluation. Préserver la forme et l'ordre des événements segmentés à l'enregistrement.
- Tester l'ouverture d'une séance historique et l'aller-retour d'une séance segmentée, ainsi qu'une séance interrompue au milieu d'une étape. Les diagnostics doivent distinguer erreur de commande, audio et rendu ; éviter d'inclure du contenu sensible supplémentaire dans les journaux.
- Mettre à jour les documents techniques et exemples uniquement après validation du comportement implémenté.

**Terminé lorsque :** anciennes et nouvelles séances peuvent être analysées et rejouées sans perdre l'ordre des paroles/actions ni compter plusieurs fois les observations pédagogiques.

## Mission 8 — Vérification finale et décision de déploiement

**Dépendances :** missions 1 à 7. **Livrable :** résultats reproductibles et décision sur l'activation par défaut.

- Exécuter depuis `app` : `npm run typecheck`, `npm test`, puis les vérifications de build et de parcours pertinentes selon l'environnement disponible. Signaler toute vérification impossible et sa raison.
- Rejouer les mêmes scénarios dans les deux formats : triangle et hypoténuse ; courbe et sommet ; transformation ou déplacement ; texte proche d'un objet ; passage `idea` → `example` → `practice` ; correction après essai ; interruption/reprise ; échec de voix et rendu indisponible.
- Mesurer ou constater avec méthode : étapes rejetées, dessins absents, temps jusqu'au premier son et au premier dessin, retard entre son et animation, fluidité entre segments, ordre et placement. Décrire le protocole et les limites ; ne pas appeler « synchronisation au mot » une mesure prise au niveau du segment.
- Accepter seulement si les deux formats restent fonctionnels, que les scénarios critiques n'ont pas de régression et que les résultats de la nouvelle forme justifient son activation. Si des critères échouent ou si les mesures ne sont pas disponibles, conserver le format historique par défaut et documenter les écarts.

**Terminé lorsque :** résultats, risques et choix d'activation sont documentés. La suppression future de l'ancien format est un chantier distinct, après décision et migration explicites.
