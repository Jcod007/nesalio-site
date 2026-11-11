# Nesalio v3.3 — Gestion de l'espace et de la caméra

Spécification de référence fournie par l'utilisateur le 2026-11-08 (issue des
discussions de conception, sous l'ancien nom « Kairos »). Le texte est repris
tel quel, avec le nom Nesalio. La section « État dans le moteur » en fin de
document dit ce qui est réellement implémenté ; la mettre à jour à chaque étape.

**Principe :** Nesalio possède un tableau virtuellement infini, sur lequel les
objets conservent leurs positions. Une caméra intelligente se déplace dans cet
espace pour diriger l'attention de l'élève. Le LLM exprime des intentions
visuelles, le moteur calcule la géométrie exacte. C'est une différence majeure
avec une présentation PowerPoint ou une scène Manim classique limitée à un
cadre fixe.

## 1. Les trois composantes

| Composante | Responsabilité | Caractéristique |
| --- | --- | --- |
| Board | Contient tous les objets et leurs positions | Virtuellement infini |
| Viewport | Fenêtre d'affichage de l'élève | Dimensions selon l'interface |
| Camera | Quelle partie du tableau est visible, à quelle échelle | Se déplace et zoome |

- **Board** : coordonnées du monde, **calculées par le moteur**, pas inventées
  par le LLM. Déplacer la caméra ne change pas les coordonnées des objets. Les
  objets restent jusqu'à leur suppression explicite ; sortir du champ ne les
  efface pas et ne les déplace pas.
- **Viewport** : `{"aspect": "auto", "safe_margin": "md"}`. Les proportions
  dépendent de la zone disponible ; la marge évite que les objets montrés
  touchent les bords. Elle ne limite jamais la taille du tableau.
- **Camera** : état `{"x", "y", "zoom"}` en **lecture seule pour le LLM**. Le LLM
  ne connaît pas les positions et dimensions exactes après rendu : il dit quoi
  montrer, le moteur calcule comment.

## 2. Le LLM pilote la caméra par intention

Une approche principale : `camera.focus` avec des `targets`. « Je veux que l'élève
voie le triangle et l'équation dans un cadrage confortable », pas « déplace la
caméra de cinq unités ».

Le moteur : récupère les cibles, calcule leur encombrement, la boîte commune, ajoute
une marge, détermine centre et zoom, calcule et exécute la transition, met à jour
`camera.state`. Objets éloignés → il peut dézoomer ; rapprochés → zoomer.

**Lisibilité :** `keep_text_readable: true`. « Tout faire entrer » n'est pas
« un cadrage pédagogique correct » : 40 équations dézoomées à l'extrême sont
illisibles. L'exigence est retenue, l'algorithme du cas impossible reste à définir.

## 3. Placement des objets

Le LLM décrit des relations, pas des coordonnées d'écran :
`{"layout": {"next_to": "triangle", "direction": "right", "gap": "lg", "align": "center"}}`.

Vocabulaire v3.3 : `next_to`, `align_to`, `center_on`, `arrange`, `grid`,
`distribute`, `fit_in`, `match_size`, `to_edge`, `to_corner`.

**Groupes :** le moteur calcule la disposition interne, puis la boîte du groupe,
puis sa position relative. Un groupe est une unité spatiale qui garde les
identifiants de ses membres.

## 4. Les boîtes englobantes

| Boîte | Définition | Utilisation |
| --- | --- | --- |
| `geometry_bounds` | Géométrie propre de l'objet | Ancres, calcul géométrique |
| `layout_bounds` | Géométrie + descendants attachés déclarés, même invisibles | Placement, réservation |
| `render_bounds` | Éléments effectivement affichés (par le renderer, pas forcément dans le viewport) | Cadrage ordinaire |

`B_layout(P) = B_geometry(P) ∪ ⋃ B_layout(E)` pour E attachement de P.
`next_to: "tri"` utilise `tri.layout_bounds`. Même règle pour les groupes.

## 5. Les attachements

Exemple : `{"id": "label_c", "type": "label", "content": "c", "attachment":
{"parent": "tri", "anchor": "hypotenuse", "placement": "outside", "gap": "sm"}}`.

Deux passes : positions de haut en bas (parent puis enfants, récursif), boîtes
de bas en haut. Graphe d'attachements sans cycle.

## 6. Réservation des objets encore invisibles

Le moteur réserve la place de tous les attachements déclarés dès le départ :
l'apparition d'un label ne doit pas déplacer une formule déjà placée.
Règle : tous les attachements déjà prévus lors de la création d'un parent sont
déclarés dans la même tranche que lui (pas tous les attachements futurs).

## 7. Nouvelles tranches sans déplacer les anciens objets

Une position résolue reste stable. Le système fonctionne comme un tableau blanc,
pas comme un document HTML qui repousse les blocs précédents.

Quand l'espace manque (ordre de résolution) :
1. chercher une disposition alternative qui respecte les contraintes ;
2. repositionner le nouvel objet ;
3. reporter son introduction si aucune solution acceptable ;
4. signaler un conflit non résolu.

Le moteur ne déplace pas arbitrairement les anciens objets. Changer la position
ou le zoom de la caméra est permis. Dézoomer résout un problème de visibilité,
pas un chevauchement réel.

## 8. Attachements tardifs

Permis même s'ils n'étaient pas connus à la création du parent. Ils ne déplacent
jamais automatiquement les objets placés : autre position pour l'annotation,
écart ajusté, ligne de rappel, sinon signalement. La boîte du parent peut
grandir pour les placements futurs sans repousser ses voisins.

## 9. Quand les anciens objets peuvent bouger

| Situation | Autorisé ? | Effet |
| --- | --- | --- |
| Un nouvel objet crée une collision et le moteur veut repousser un ancien | Non par défaut | Les anciens restent |
| Le LLM demande explicitement `move` | Oui | Déplacement intentionnel |
| Le LLM demande explicitement `layout.reflow` | Oui | Réorganisation volontaire des cibles |

Les labels attachés suivent les transformations de leur parent selon leurs ancres.

## 10. Boîtes utilisées par la caméra

| Situation | Boîte |
| --- | --- |
| Cadrer des objets déjà affichés | `render_bounds` par défaut |
| Préparer le cadrage d'objets pas encore apparus | `layout_bounds` lorsque demandé |
| Placer un nouvel objet avec `next_to` | `layout_bounds` |
| Cadrer un groupe | Union des boîtes des membres |
| Cadrer un parent avec labels | Boîtes incluant les descendants attachés pertinents |

`camera.focus` avec `bounds: "layout_bounds"` prépare un cadrage qui réserve la
place d'une note qui apparaîtra quelques mots plus tard.

## 11. Déplacement et zoom de la caméra

`camera_policy` : `mode: intent_driven`, `default_focus_bounds: render_bounds`,
`allow_focus_on_layout_bounds_for_unrevealed_targets: true`, `focus_padding: md`,
`keep_text_readable: true`, `default_transition: smooth`,
`camera_coordinates_are_runtime_only: true`,
`dynamic_focus_policy: fit_declared_parameter_range_if_available`.

Deux états : l'**état courant** (position et zoom réels) et l'**état cible**
(calculé depuis l'intention), pour les transitions fluides, les interruptions et
les changements de cadrage en cours de mouvement :
`{"camera": {"state": {...}, "is_animating": false, "target_state": null}}`,
entièrement tenu par le moteur.

## 12. Objets dynamiques

`dynamic_policy: recompute_during_parameter_change`,
`dynamic_conflict_policy: reserve_parameter_range_or_report_unresolved`,
`dynamic_focus_policy: fit_declared_parameter_range_if_available` : réserver et
cadrer toute la plage d'un paramètre animé pour éviter que la caméra dézoome
sans cesse.

## 13. Génération par tranches

LLM (tranche) → validateur → moteur de placement → moteur de caméra → rendu →
état d'exécution. Une tranche peut viser un objet introduit plusieurs tranches
plus tôt et le recadrer avec `camera.focus` sans le recréer. Aucune limite
spatiale ni de nombre de tranches.

## 14. Paramètres du moteur jamais régénérés par le LLM

Le moteur et l'application possèdent `scene.board`, `scene.viewport`,
`scene.layout_rules`, `scene.camera_policy`, les positions et `runtime_state`.
Le LLM produit objets, relations, groupes et attachements, intentions
`camera.focus`, narration et actions, nouveaux paramètres mathématiques. Il peut
lire `runtime_state`, jamais l'écrire.

## 15. Points encore ouverts (au moment de la spécification)

| Point | Décision | À définir |
| --- | --- | --- |
| Zoom minimal et maximal | Préserver la lisibilité | Seuils exacts, cas impossible |
| Trajectoires de caméra | `smooth` | Interpolation, vitesse, interruptions |
| `camera.restore` | Au vocabulaire | Sauvegarde et identification des cadrages |
| `camera.follow` | Au catalogue | Suivi, anticipation, limites |
| `to_edge`, `to_corner` | Au catalogue | Ne pas dépendre en permanence du viewport : résoudre une fois au placement, puis position fixe dans le monde |
| `layout.reflow` | Réorganisation explicite | Contrat des objets déplaçables et des attachements |
| Conflits spatiaux complexes | Préserver l'existant | Algorithme de résolution |
| Objets dynamiques | Réserver la plage | Boîtes sur toute la plage, cas impossibles |

## 16. Responsabilités

LLM : quels objets afficher, lesquels rapprocher, lesquels doivent attirer
l'attention, s'il faut déplacer une composition. Moteur de placement : positions
exactes, labels, collisions. Moteur de caméra : position, zoom, animation (avec
l'ordonnanceur). Runtime : positions et dimensions actuelles.

---

## État dans le moteur (à tenir à jour)

Au 2026-11-08 (Claude Code), comparaison avec `app/src/domain/nesalio/` :

- ✅ Tableau infini, coordonnées du monde, positions stables, anciens objets
  jamais repoussés ; `camera.focus` (boîte, marge, centre, zoom, `smooth`) ;
  `layout_bounds` / `render_bounds` ; attachements en deux passes et réservation ;
  groupes, `next_to`, `align_to`, `center_on`, `arrange`.
- ✅ (2026-11-08) `keep_text_readable` : zoom borné à `CAMERA_ZOOM` = 0,6 à 1,5
  fois la taille de conception (`sceneState.ts`). Si les cibles ne tiennent pas,
  la caméra cadre d'abord celles que le passage révèle, puis celles qu'il
  surligne, puis la dernière nommée. Les objets gardés rejoignent le cadrage
  retenu s'ils tiennent. Les cibles hors champ sont signalées (`framing`).
- ✅ (2026-11-08) `camera.focus` sans `bounds` sur des cibles dont rien n'est encore
  visible → `layout_bounds` automatiquement, si
  `allow_focus_on_layout_bounds_for_unrevealed_targets` est vrai.
- ✅ (2026-11-08) `target_state` dans l'état d'exécution pendant une transition.
- ✅ (2026-11-08) `interpolateZoom` calcule la trajectoire et propose la durée des
  cadrages fluides. Le lecteur échantillonne sur la voix, borne le zoom pendant le
  mouvement et limite la durée implicite à 300–1 200 ms avant coupure à la fin du
  clip. `after:` suit la fin calculée. Les petits recadrages sont évités lorsque
  les cibles sont déjà dans le cadre courant ou dans sa destination.
- ✅ (2026-11-08) `camera.focus.save_as` nomme une intention de cadrage (cibles
  et choix des boîtes). `camera.restore.frame` la reprend avec la géométrie
  actuelle, y compris les formules remplacées et les objets déplacés. Si les
  cibles ont quitté le tableau, le lecteur revient à la position sauvegardée.
  Les noms sont uniques et validés entre les tranches. Le retour suit les règles
  de mouvement et de synchronisation d'un `camera.focus`.
- ✅ (2026-11-08) §1 : les figures d'une tranche sans placement propre partagent un
  **repère** ; le moteur place ce repère comme un bloc (`frames` dans l'état de
  scène). `frame: id` fait rejoindre un repère existant (validé : figures
  seulement, cible connue, pas de `layout`/`attachment` en plus, sans cycle).
  Le premier repère d'un tableau vide reste à l'origine.
- ✅ (2026-11-08) §7 : un bloc sans relation (repère, texte libre) va dans une zone
  libre — sous la dernière composition, sinon à côté, sinon à côté de tout, puis
  plus bas ; jamais par-dessus ; les anciens objets ne bougent pas.
- ✅ (2026-11-08) Les textes et étiquettes évitent la **forme réelle** des figures
  (`Measurement.collision` : lignes des axes, tracé des courbes, côtés des
  polygones, cercle) au lieu de les ignorer.
- ⚠️ Une relation choisie par le modèle reste respectée même si elle donne une
  composition serrée (ex. `next_to` d'un élément au milieu d'une colonne).
- ✅ (2026-11-08) Formules à taille de police commune (une fraction n'est plus écrasée).
- ✅ (2026-11-08) Dégager le tableau : `dim`, `fade_out`, `remove` (les deux derniers
  libèrent la place ; seul `remove` interdit de réutiliser l'objet).
- ✅ (2026-11-08) `transform` (formule → formule, sur place) ; `move` ; layouts
  `to_edge` / `to_corner` résolus une fois contre ce que voit l'élève (§15).
- ✅ (2026-11-08) Suivi automatique : la caméra cadre ce qui apparaîtrait hors champ.
  Objets rangés sur un bord/coin gardés dans le cadre (`kept`). Une nouvelle tranche
  se place d'abord au milieu de ce que voit l'élève, sinon près des objets gardés.
- ✅ (2026-11-08) Courbe sur des axes arrêtée aux bords des axes (§10).
- ✅ (2026-11-08) Cadrer une figure (courbe, polygone…) emporte les points posés
  dessus (même repère, dans sa zone) et leurs étiquettes ; un zoom sur un seul point
  n'emporte pas la figure entière.
- ✅ (2026-11-08) Récapitulatif final : le générateur reçoit la consigne de
  dégager le tableau dans le dernier passage de la tranche précédente, puis
  d'afficher une composition courte qui reste visible. Trois rejeux de leçons
  générées (sommet, proportionnalité, équation) sans `framing` au dernier
  passage. Le respect de la consigne varie dans les générations en flux.
- ✅ (2026-11-08) `camera_policy.focus_padding` lu (`FOCUS_PADDING` : xs 0,97 … md 0,9 … xl 0,8)
  et `dynamic_focus_policy` appliqué (zone réservée d'une courbe sur la plage de son paramètre).
- ❌ `layout.reflow`, `camera.follow`, `camera.hold`, `grid`,
  `distribute`, `fit_in`, `match_size` non exécutables.
- ❌ Viewport fixé en 16:9 sur `/dev/nesalio` au lieu de `aspect: auto`.
- Suite détaillée : [`chantier-camera.md`](chantier-camera.md).
