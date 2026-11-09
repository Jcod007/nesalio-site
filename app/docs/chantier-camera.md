# Chantier caméra Nesalio — fiche de passation

Fiche écrite le 2026-11-08 par Claude Code pour qu'une autre IA reprenne le
chantier caméra sans refaire le chemin. À lire **en entier avant de toucher au
code**. Elle complète, sans les remplacer :

- [`AGENTS.md`](../../AGENTS.md) : règles du dépôt (tenir `SUIVI.md` à jour à chaque étape) ;
- [`SUIVI.md`](../../SUIVI.md) : journal de toutes les sessions, décisions de l'utilisateur ;
- [`nesalio-espace-camera.md`](nesalio-espace-camera.md) : la spécification espace/caméra de l'utilisateur ;
- [`app/AGENTS.md`](../AGENTS.md) : règles Next.js.

---

## 1. Règles de travail (non négociables)

1. **Langue** : tout en français (code commenté en anglais comme le reste du dépôt,
   mais journal, messages d'erreur du moteur, prompt et réponses à l'utilisateur en français).
2. **Nom** : le projet s'appelle **Nesalio**. « Kairos » est un ancien nom, ne jamais l'utiliser
   (seule la branche git `codex/kairos-json-contract` le garde).
3. **Journal** : une entrée dans `SUIVI.md` (en haut de « Journal ») **après chaque étape**,
   pas à la fin : fait / fichiers / vérifié comment / pas vérifié / décisions / prochaine étape.
4. **Rien n'est commité** sur cette branche ; tout le travail est dans l'arbre de travail.
   Ne pas commiter, ne pas créer de branche, sans accord explicite de l'utilisateur.
5. **Vérifier avec de vrais appels** (décision de l'utilisateur) : la preuve qu'une
   amélioration marche est une **vraie génération** par le modèle de l'appli, jouée à
   l'écran — pas une leçon écrite ou retouchée à la main. Une leçon générée et
   sauvegardée par le script (`analyses/generations/*.json`) peut être rejouée pour
   observer un comportement précis.
6. **Chaque correction a un test qui échoue sans elle.** Vérifier en neutralisant
   temporairement la correction (puis la remettre) — c'est ce qui a été fait pour
   toutes les règles récentes.
7. `npx tsc --noEmit -p .` et `npx vitest run` (dans `app/`) doivent passer : **590 tests** au départ.

---

## 2. Principes à ne pas casser

Ces décisions ont été prises avec l'utilisateur ; les remettre en cause demande
de lui poser la question.

- **Le modèle exprime des intentions, le moteur possède l'état.** Le modèle (LLM) ne
  donne jamais de coordonnée d'écran ni de position de caméra : `camera.focus` dit
  *quoi* montrer, le moteur calcule position et zoom.
- **Placement relatif** : textes et formules se placent par relation (`next_to`,
  `align_to`, `center_on`, `attachment`, groupes `arrange`, `to_edge`/`to_corner` par
  rapport à ce que voit l'élève) ou pas du tout (le moteur choisit). Les figures ont des
  coordonnées *mathématiques* dans leur repère ; le repère est placé par le moteur.
- **Tableau infini, positions stables.** Une position calculée ne bouge plus ; seul un
  `move` demandé par le modèle déplace un objet. La caméra se déplace, pas le contenu.
- **Lisibilité** : zoom borné par `CAMERA_ZOOM` (0,6 à 1,5 fois la taille de conception).
  Si tout ne tient pas lisiblement, ce que le passage révèle passe en premier, le reste
  est signalé (avertissement `framing`) au lieu de tout rapetisser.
- **La leçon ne s'arrête jamais** pour une raison de mise en page ou de synchro : un
  problème devient un avertissement (`onWarning`), pas une exception.
- **Synchro exacte** : les gestes partent sur l'heure du mot dans la voix ; ne pas
  introduire d'estimation de temps.

---

## 3. Où est le code caméra

Tout est sous `app/src/`. Le système Nesalio est **à côté** de l'ancien moteur
(`domain/scene/`, `engine/player.ts`), qui sert encore au parcours élève : ne pas
toucher à l'ancien.

| Fichier | Rôle pour la caméra |
| --- | --- |
| `domain/nesalio/contract.ts` | Format JSON. `Action` : `camera.focus { targets, bounds?, transition?, save_as? }`, `camera.restore { frame, transition? }`, `move { target, to }`. `Layout` (dont `to_edge`, `to_corner`). Les `.describe()` sont repris tels quels dans le prompt. |
| `domain/nesalio/lesson.ts` | Réglages moteur d'une leçon, dont `camera_policy` (`focus_padding`, `dynamic_focus_policy`… **non lus**, voir §5). |
| `domain/nesalio/engineShell.json` | Valeurs par défaut de ces réglages, ajoutées par le moteur à chaque leçon. |
| `domain/nesalio/sceneState.ts` | Cœur : `CAMERA_ZOOM`, `fitSceneCamera` (cible caméra + `hidden`), `cameraView` / `visibleArea` (zone vue), `sceneBounds` (`render_bounds` = visible, `layout_bounds` = réservé), `keptInView` (objets rangés à garder), placement (`introduceSlice` → `freeSpot`, `placeOnScreen`), `moveShift`, `shiftObjects`. |
| `domain/nesalio/placement.ts` | Géométrie pure : `positionFor`, `beside`, `avoidOverlap`, `union`… |
| `engine/nesalioPlayback.ts` | Lecteur. `planPassage` (destinations et durées, suivi des révélations), `planFocus` (`interpolateZoom`), `frameAt` (échantillonnage, `target_state`), `NesalioWarning` (`framing`). |
| `ui/board/manim/ManimRenderer.ts` | `applyNesalioView` : applique `camera.state` (x, y, zoom) au rendu Manim. |
| `ui/board/manim/NesalioProjection.ts` | Dessine les objets (pas de logique caméra). |
| `server/nesalio/prompt.ts` | Prompt du générateur : règles de placement/caméra données au modèle (`LAYOUT_RULES`), exemples. |
| `app/dev/nesalio/page.tsx` | Page de test `/dev/nesalio` ; viewport de conception `{x0:-8, y0:-4.5, x1:8, y1:4.5}`, cadre CSS **fixé en 16:9**. |

### Comment la caméra bouge aujourd'hui

1. Au début de chaque passage, le lecteur part de la caméra de la fin du passage précédent.
2. Un `camera.focus` du modèle calcule une cible avec `fitSceneCamera` (cibles + objets
   gardés). D3 interpole entre les vues de départ et d'arrivée. Le lecteur échantillonne
   la trajectoire à partir de l'horloge audio et borne le zoom à chaque image.
3. **Suivi automatique** : avant chaque `show` / `draw` / `write` / `transform`, le
   moteur vérifie la destination de la caméra ou, au repos, son cadre courant. Si
   l'objet à révéler est hors champ, il ajoute un cadrage des objets visibles de la
   tranche et du nouveau, qui passe en priorité.
4. **Objets gardés** (`SceneState.kept`) : rangés par `move` ou `layout` vers un bord/coin ;
   chaque cadrage les inclut s'ils tiennent lisiblement.
5. **Placement** (`freeSpot`) : une nouvelle tranche se met d'abord au milieu de ce que voit
   l'élève si c'est libre, sinon près des objets gardés, sinon sous / à côté de la
   précédente en gardant la tranche au format de l'écran.

---

## 4. Tester

Dans `app/` :

```bash
npx tsc --noEmit -p .
npx vitest run
```

Tests caméra/espace existants : `domain/nesalio/spaceRules.test.ts`,
`sceneState.test.ts`, `clearing.test.ts`, `transform.test.ts`, `move.test.ts`,
`engine/nesalioPlayback.test.ts` (bloc « la caméra suit ce qui apparaît »).
Modèle à suivre pour un test de lecture : `play(...)` dans `move.test.ts` (faux clip
audio piloté par des instants donnés, `wait` instantané).

### Vraie génération (script, sans navigateur)

```bash
GENERATION_REELLE=1 QUESTION="Comment trouver le sommet d'une parabole ?" SORTIE=sommet npx vitest run tools/eval/generation-reelle.test.mjs
```

Écrit `analyses/generations/<SORTIE>.json` (leçon), `.brut.txt` (sortie du modèle),
`.rapport.json` (validation tranche par tranche). Coût réel faible. Il faut
`app/.env.local` avec `VERCEL_OIDC_TOKEN` (expire ~12 h après `vercel env pull`).

### À l'écran

- `.claude/launch.json` (non versionné) lance `next dev` avec `DISABLE_AI=0` et un
  `NESALIO_DEV_ACCESS_TOKEN`. Le cookie `nesalio_dev` = HMAC-SHA256 du jeton sur
  `nesalio-development-access-v1` (`server/devAccess.ts`) ouvre les routes sans compte.
- Page `/dev/nesalio` : champ « Question » + « Générer et lire » (vraie génération en
  flux), ou « Leçon JSON » + « Lire la leçon » pour rejouer un fichier.
- Si un autre `next dev` tourne déjà dans le dossier (port 3000), un second ne démarre
  pas : utiliser celui-là, il sert le même code (rechargement à chaud).
- Le cadre de la caméra est le canevas sous les boutons ; régler la fenêtre à environ
  1280×980 pour le voir entier. Les avertissements (`framing`, `deferred`, `silent`)
  s'affichent au-dessus du tableau.
- Journal serveur : `app/.next/dev/logs/next-development.log`, lignes `nesalio:`
  (raisons exactes des tranches refusées, lignes JSON illisibles).
- Les animations durent moins d'une seconde : des captures toutes les 4–6 s ne les
  attrapent presque jamais. Dire « vu avant/après » plutôt que « vu l'animation ».
- **Pour voir un mouvement, enregistrer la lecture** (dans `app/`, serveur lancé) :
  `node tools/eval/video-nesalio.mjs ../analyses/generations/<leçon>.json <nom>`
  → `analyses/videos/<nom>.webm` + `<nom>.passages.json` (heure de chaque passage
  dans la vidéo, avertissements, erreurs de page). Avec `FRAMES_DIR=<dossier>`, chaque
  image est aussi gardée, nommée par son heure en millisecondes. Le script utilise le
  Chrome de la machine et l'encodeur ffmpeg du cache Playwright, sans téléchargement
  (l'enregistreur vidéo de Playwright lui-même demande un ffmpeg plus récent).

### Pièges déjà rencontrés

- **Git Bash mange les `\\`** dans les heredocs / `printf` : du LaTeX écrit dans un test
  par le shell devient faux (`"\left"` au lieu de `"\\left"`). Écrire ces fichiers avec
  l'outil d'édition de fichiers, puis vérifier par une recherche.
- Le modèle varie d'un appel à l'autre : un comportement vu une fois (ou pas vu) n'est
  pas une preuve ; relancer ou rejouer le JSON sauvegardé.
- Une tranche refusée est renvoyée **une** fois au modèle (au plus 3 corrections par leçon) ;
  si sa correction échoue aussi, la leçon s'arrête à ce qui était valide. Lire la raison dans le
  journal serveur (`nesalio: tranche refusée`, `nesalio: leçon arrêtée sur un refus`).

---

## 5. Ce qui reste à faire (ordre conseillé)

Chaque point : le problème observé, où regarder, une piste, et comment vérifier.
Les pistes sont des propositions : si un choix change ce que voit l'élève de façon
notable, **demander à l'utilisateur** avant.

### 5.1 Récapitulatif final trop dézoomé — traité

- Le prompt demande une composition courte qui reste visible à la fin, et un
  `fade_out` ou `remove` pour les éléments devenus inutiles dans le dernier passage
  de la tranche précédente. Le centre peut accueillir le résumé s'il a été libéré.
- Si les cibles d'un `camera.focus` sont trop éloignées, priorité à celles que le
  passage révèle, puis à celles qu'il surligne, puis à la dernière cible nommée.
  Les objets gardés sont ajoutés s'ils tiennent autour du cadrage retenu.
- Rejeux de trois vraies générations sur `/dev/nesalio` (sommet d'une parabole,
  proportionnalité et équation du premier degré) : résumés lisibles, aucun
  `framing` au dernier passage.
  Les essais en flux montrent que le modèle peut encore omettre une consigne du
  résumé ou produire une tranche refusée. Détails dans `SUIVI.md`.

### 5.2 Mouvements de caméra plus naturels — traité

- `interpolateZoom` fournit la trajectoire et la durée recommandée. Avec `at`, la
  durée est modulée par `quick` (×0,5) ou `slow` (×1,875), bornée de 300 à 1 200 ms,
  puis coupée à la fin du clip. `after:` attend la fin prévue du geste. Les repères
  explicites `start/end` déterminent leur propre intervalle. `instant` cadre au départ.
- Un mouvement fluide est évité si le déplacement est d'au plus 2 % de la largeur
  visible, la variation de zoom d'au plus 3 % et les cibles tiennent déjà. Le suivi
  réutilise un cadrage en cours si sa destination contient la prochaine révélation.
- Rejeu de la leçon générée sur le sommet d'une parabole. Captures intermédiaires
  du passage du graphique aux calculs et du retour vers le graphique, sans
  avertissement de lecture. Voir `SUIVI.md` pour les tests.

### 5.3 `camera.restore` — traité

- `save_as` donne un nom unique dans la leçon au cadrage calculé par `camera.focus`.
  Le lecteur mémorise les cibles et le choix de `bounds` au départ du geste. Le
  validateur conserve les noms entre les tranches et exige une sauvegarde préalable.
- `camera.restore { frame }` recalcule le cadrage sur les cibles présentes et suit
  les formules remplacées, y compris dans les groupes. Les objets déplacés sont
  cadrés à leur nouvelle place. Les objets sortis du tableau sont ignorés. Si aucune
  cible n'est cadrable, le lecteur reprend la position calculée à la sauvegarde.
- Le retour utilise l'ordonnancement et la trajectoire d'un cadrage de la 5.2.
  Le prompt montre la vue d'ensemble, le détail d'un point et le retour sur « revenons ».
- `retour-parabole.json`, générée par le modèle et rejouée sur `/dev/nesalio`,
  montre le sommet de près puis le retour à la courbe entière, avec une capture
  intermédiaire. La lecture s'est terminée sans avertissement.

### 5.4 Écran de téléphone / format automatique — priorité 4

- **Problème** : le contrat prévoit `viewport.aspect: "auto"`, mais la page de test est
  fixée en 16:9 et le viewport de conception est 16×9. Rien n'a été vu en écran vertical,
  où le zoom lisible et le choix « dessous / à droite » de `freeSpot` changent beaucoup.
- **Où** : `app/dev/nesalio/page.tsx` (cadre CSS, `viewport` passé au lecteur),
  `ManimRenderer.applyNesalioView`, `freeSpot` (score « format de l'écran »).
- **Vérifier** : outil de redimensionnement du navigateur (préréglage mobile).

### 5.5 Cadrer toute la plage d'un paramètre animé — traité

- Une courbe (`function_graph`, `parametric_curve`) dont l'expression utilise un
  paramètre déclaré réserve la zone qu'elle couvre sur toute sa plage
  (`parameterReserve`, `parametersOf` dans `measurement.ts`), coupée aux axes.
- Avant un `animate_parameter`, `planPassage` vérifie que la zone réservée des objets
  qui en dépendent (avec leurs axes) est visible ; sinon il ajoute un cadrage
  automatique `plage_<id>`. Tests : `domain/nesalio/dynamic.test.ts`.
- Vu en vraie génération (« coefficient a ») : la parabole reste entière pendant que
  `a` varie. Le prompt borne maintenant les axes à 24 × 13 unités : au zoom lisible
  minimum, la caméra n'en montre pas plus (des axes de −8 à 8 en hauteur
  donnaient un avertissement `framing` à chaque passage).

### 5.6 Petits restes

- ✅ `camera_policy.focus_padding` lu : `FOCUS_PADDING` dans `nesalioPlayback.ts`
  (`md` = 0,9, la marge d'avant ; `xs` 0,97 à `xl` 0,8), transmis à `fitSceneCamera`.
- ✅ Étiquettes : cadrer une figure emporte les points posés dessus et leurs étiquettes
  (`withFrames` dans `fitSceneCamera`). Test `cameraDetails.test.ts`, qui échouait avant.
- `camera.follow` / `camera.hold` : absents du contrat ; moins urgents depuis le suivi
  automatique. Ne pas les ajouter sans besoin observé.
- Mettre à jour la section « État dans le moteur » de `nesalio-espace-camera.md` à la fin.

---

## 6. Ce qu'il ne faut pas faire

- Ne pas donner au modèle des coordonnées d'écran ou de caméra, ni lui demander de gérer la place.
- Ne pas faire bouger automatiquement des objets déjà placés pour « faire de la place ».
- Ne pas élargir `CAMERA_ZOOM` pour tout faire tenir : un texte illisible est pire qu'un
  objet hors cadre signalé.
- Ne pas modifier l'ancien moteur (`domain/scene/`, `engine/player.ts`) ni le parcours élève.
- Ne pas déclarer une amélioration « vérifiée » sur la seule base des tests unitaires ou
  d'une leçon écrite à la main.
