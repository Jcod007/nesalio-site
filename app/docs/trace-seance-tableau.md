# Comment une séance produit et anime une illustration

Ce document suit un cas concret : l’élève demande de tracer une parabole, interrompt Nesa pour préciser son besoin, répond à une question sur la courbe, puis ouvre une autre séance. Il distingue une **relance dans la même séance**, qui garde le tableau et le contexte, d’une **nouvelle séance**, qui les remet à zéro.

Les réponses initiales et la relance « Je comprends pas. Trace la courbe. » viennent d’un [échange enregistré pour le pitch](../../analyses/pitch-2026-11-04/session.ndjson), lignes 4 et 5. La seconde séance rejoue la ligne 1. Le [journal JSON du rejeu](trace-seance-tableau.json) contient les corps de requête, les événements du serveur, les entrées et sorties de `planStep`, les modifications produites par `applyAction` et les états du lecteur. Les trois corps historiques concordent avec les corps reconstruits par le lecteur actuel. Le réseau est remplacé par les réponses enregistrées, la voix est simulée à 2 400 ms par phrase et le clic sur le choix 1 est ajouté pour illustrer `continue`. Le rejeu n’a pas rendu le canvas ni appelé le modèle.

## 1. L’élève ouvre une séance

L’élève saisit : « Trace f(x) = −(x − 2)² + 3 pour m’expliquer ses zéros. »

| Appel | Entrée | Sortie ou effet observé |
| --- | --- | --- |
| `TutorApp` → [`Player.ask(question)`](../src/engine/player.ts#L204) | Le texte saisi | `reset()` remet à zéro l’historique, le tableau, le plan et les observations de séance ; l’état passe à `thinking`. |
| `openSegment("question", request)` → `consume(...)` | La requête ci-dessous | Crée un segment vide puis ouvre le flux. |
| [`createHttpSource().open(request, signal)`](../src/services/tutor/httpSource.ts) | La requête et un signal d’annulation | Envoie `POST /api/tutor`, lit les lignes NDJSON et valide les événements avant de les transmettre au lecteur. |

```json
{
  "mode": "question",
  "question": "Trace f(x) = −(x − 2)² + 3 pour m’expliquer ses zéros."
}
```

En production, [`POST`](../src/app/api/tutor/route.ts#L42) contrôle l’accès et le quota, lit et valide le corps, puis appelle [`tutorEvents`](../src/server/tutor/service.ts#L32). En mode modèle, `decideTeaching` choisit la conduite du tour ; `buildMessages` prépare les messages ; `config.completion` fournit le texte ; `JsonObjectScanner` et `parseLine` en tirent des événements validés. Le service contrôle les étapes et la route encode les événements en NDJSON. Ces appels internes sont décrits à partir du code : la capture conserve les requêtes et les événements transmis, pas les paramètres privés de l’appel au fournisseur.

La première réponse enregistrée contient `source:model`, `lesson`, cinq `step`, puis `await`. `consume` met les étapes en file ; `playStep` les joue une par une. Une étape déjà reçue ne veut donc pas dire que l’élève l’a déjà vue.

| Étape | Commande reçue | Valeur effectivement transmise à `applyAction` avant l’interruption |
| --- | --- | --- |
| 1 | Repère `axes`, x de −1 à 5, y de −3 à 4 | `{ start: 0, duration: 900 }` ms |
| 2 | Point `sommet` à `[2, 3]`, étiquette `(2, 3)` | `{ start: 2759, duration: 450 }` ms |
| 3 | Segment `axe_sym` de `[2, -3]` à `[2, 4]`, en pointillés | `{ start: 5264, duration: 650 }` ms |
| 4 | Texte `info_z` | Encore en file quand l’élève interrompt. |
| 5 | Question « Combien de zéros y a-t-il pour cette parabole ? » | Encore en file quand l’élève interrompt. |

## 2. L’élève interrompt et demande de tracer la courbe

[`Player.interrupt()`](../src/engine/player.ts#L236) coupe la lecture en cours et passe à `paused`. L’élève dit ensuite « Je comprends pas. Trace la courbe. » [`Player.followUp(text)`](../src/engine/player.ts#L211) enregistre une demande d’aide, appelle `buildContext(true)` et envoie une requête `followUp`. `boardContext()` et `summarizeBoard()` transmettent au serveur un résumé des objets déjà posés.

Extrait du corps réellement reconstruit (les phrases et objectifs complets sont dans le journal JSON) :

```json
{
  "mode": "followUp",
  "question": "Je comprends pas. Trace la courbe.",
  "context": {
    "originalQuestion": "Trace f(x) = −(x − 2)² + 3 pour m’expliquer ses zéros.",
    "interrupted": true,
    "answered": 0,
    "board": [
      { "id": "axes", "type": "axes", "detail": "x de -1 à 5, y de -3 à 4" },
      { "id": "sommet", "type": "point", "detail": "(2, 3) « (2, 3) »" },
      { "id": "axe_sym", "type": "segment", "detail": "de (2, -3) à (2, 4)" }
    ]
  }
}
```

La réponse enregistrée contient `source:model`, une étape qui ajoute la courbe, une étape qui pose un QCM, puis `await`. La commande de la courbe est :

```json
{
  "type": "curve",
  "id": "f_curve",
  "fn": "-(x-2)^2+3",
  "from": -1,
  "to": 5,
  "color": "blue",
  "style": "solid",
  "label": "f(x)"
}
```

| Appel | Entrée | Sortie ou effet |
| --- | --- | --- |
| `playStep()` → `prepareSpeech()` puis `speaker.speak()` | Phrase qui commence par « Ok, reprenons ensemble » | Durée simulée : `2400` ms. En usage normal, le lecteur essaie d’utiliser la durée de l’audio préparé. |
| [`retimeCues()`](../src/domain/timeline/spokenTime.ts) | Phrase, repère reçu `f_curve: 0.1291390728476821`, durée `2400` ms | Repère recalé : `f_curve: 0.1225`. |
| [`planStep()`](../src/domain/timeline/plan.ts) | La commande `curve`, la durée `2400` et le repère recalé | `offset: 144`, `duration: 1700`, `drawingMs: 1844`, en millisecondes. |
| [`applyAction()`](../src/domain/scene/commands/index.ts#L131) → [`curveCommand.apply()`](../src/domain/scene/commands/figure.ts#L70) | Tableau existant, commande `f_curve`, `{ start: 6058, duration: 1700 }` | Ajoute un nœud `curve` bleu ; conserve le repère, le sommet et le segment. L’étiquette `f(x)` reçoit `labelAt: [4.93631738041535, -2.9062269982828752]`. |
| [`ManimBoard`](../src/ui/board/ManimBoard.tsx) → [`ManimRenderer.sync()` puis `buildShape()`](../src/ui/board/manim/ManimRenderer.ts) | Le nouvel état du tableau ; l’expression `-(x-2)^2+3` ; l’intervalle `[-1, 5]` | Dans le navigateur, le renderer compile l’expression, découpe la courbe en portions avec `sampleCurve`, trace avec `axes.plot`, puis prévoit `Create` pour le tracé et `FadeIn` pour l’étiquette. Ce passage est décrit à partir du code ; le rejeu s’arrête à la production de l’état du tableau. |

Au QCM de relance, l’état vaut `checking` et le tableau contient `axes`, `sommet`, `axe_sym`, `f_curve`. La courbe a été ajoutée au même repère.

## 3. L’élève répond, puis démarre une autre séance

**Réponse au QCM, simulée pour le rejeu.** `Player.answer(1)` sélectionne le deuxième choix : « Deux zéros, autour de x ≈ 0 et x ≈ 4 ». `assessAnswer(check, 1)` donne `{ correct: true, method: "answer-key" }` parce que la clé du QCM vaut `1`. Ce verdict compare le choix à la clé fournie ; il ne recalcule pas les racines. Les valeurs exactes sont `2 ± √3`, soit environ `0,268` et `3,732`.

Le lecteur ajoute une observation `correct`, de format `choice` et avec aide `guided`. `answered()` mémorise la réponse ; `tryContinue()` envoie le tour suivant une fois le signal `await` reçu et le flux fermé. La requête `mode: "continue"` reprend la **question initiale**, le résumé du tableau avec `f_curve`, `answered: 1` et la réponse choisie. La réponse serveur à ce troisième appel est simulée (`source`, `end`). Le lecteur reprend alors les étapes de la question initiale qui étaient restées en attente : `info_z` apparaît et le premier QCM est affiché.

**Nouvelle séance.** On appelle ensuite `Player.ask("Je bloque sur les zéros d’une parabole.")`. Juste après l’appel, l’état vaut `thinking`, le tableau résumé est `[]` et `check` vaut `null`. La nouvelle requête porte `mode: "question"`, sans `context` ni `answer`. Après lecture de la deuxième capture, le nouveau tableau contient `n1` (`f(x) = −(x − 2)² + 3`) et `n2` (`(x − 2)² = 3`). La courbe `f_curve` de la première séance n’est plus présente. L’identifiant technique de la page, utilisé dans les en-têtes HTTP, est distinct de ce contexte pédagogique remis à zéro.

## Demande à reprendre pour la suite

> À partir de cette séance enregistrée et de sa trace de rejeu, améliore le passage entre explication, illustration et exercice. Quand l’élève demande « Trace la courbe », affiche-la sur le repère déjà construit, conserve le sommet et l’axe de symétrie, puis fais apparaître la courbe au moment où Nesa en parle. Après la réponse au QCM de relance, examine si le retour au QCM initial répète inutilement la même vérification, et propose un comportement qui tient compte de la réponse déjà donnée. Vérifie le parcours dans le navigateur sur ordinateur et téléphone : lisibilité du repère et de l’étiquette, cohérence des deux intersections avec l’explication, conservation du tableau pendant la relance et remise à zéro quand une autre séance démarre. Pour chaque défaut constaté, indique l’appel en cause, son entrée, sa sortie observée et la sortie attendue.
