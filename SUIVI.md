# Suivi des travaux

Journal partagé entre les IA qui codent sur Nesalio. Lire avant de commencer,
mettre à jour à chaque étape (voir [AGENTS.md](AGENTS.md)). Le plus récent en haut.

---

## État actuel : format Nesalio v3.3 (branche `codex/kairos-json-contract`)

> **Nom :** « Kairos » est l'**ancien nom** de ce système. Il a été renommé
> **Nesalio** partout le 2026-11-08 (code, types, fichiers, en-tête HTTP, page
> de test, ce journal). Ne plus utiliser « Kairos ». Seuls restent l'ancien nom
> de la branche git et les fichiers d'origine de l'utilisateur dans
> `Downloads/` (`kairos_scene_v3_3.json`, `kairos_vocabulary_v3_3.json`).

Nouveau système voix + tableau, écrit de zéro à côté de l'ancien
(`src/domain/scene/schema.ts`, `src/engine/player.ts`), qui reste celui du
parcours élève. Code dans `app/src/domain/nesalio/`.

Rien n'est commité : tout le travail est dans l'arbre de travail.

| Module | État |
| --- | --- |
| Contrat JSON + validation (`contract.ts`, `validate.ts`) | Fait, testé |
| État de scène + placement (`sceneState.ts`, `placement.ts`) | Fait, testé |
| Moteur mathématique (`compileNamedExpression` dans `src/domain/math/expr.ts`) | Partiel : ajouté à l'ancien `expr.ts`, pas réécrit de A à Z, un seul test |
| Ordonnanceur (`scheduler.ts`) | Fait, 3 tests |
| Audio (`alignment.ts`, `/api/voice`, `services/voice/nesalioClip.ts`) | Fait, testé en réel le 2026-11-08 (voir journal) |
| Lecteur Nesalio + Manim (`engine/nesalioPlayback.ts`, `ui/board/manim/NesalioProjection.ts`) | Joue en réel sur la page de test `/dev/nesalio` ; pas dans le parcours élève |
| Générateur de tranches + prompt (`server/nesalio/`, route `/api/nesalio`) | Fait, joué en réel en flux (premier son ≈ 3 à 7 s) |
| Tableau : dim / fade_out / remove, transform, move, to_edge / to_corner | Fait, vu en vraie génération (2026-11-08) |
| Caméra | En cours : suivi automatique et objets gardés faits ; **reste détaillé dans [`app/docs/chantier-camera.md`](app/docs/chantier-camera.md)** (fiche de passation pour une autre IA) |
| Orchestrateur de séance (interruptions) | Pas commencé |
| Bascule du parcours élève sur Nesalio | Pas commencée |

### Décisions prises

- **Pas d'exemple fétiche.** Le contrat part de règles valables pour toute leçon,
  pas de Pythagore. Les cas de test doivent vérifier une règle réutilisable.
- **Le modèle exprime des intentions, le moteur possède l'état** : coordonnées,
  caméra et minutage sont calculés par le moteur, jamais écrits par le modèle.
- **Synchronisation exacte, sans estimation.** Le repère (`cue`) est cherché dans
  le texte `say` (plage de caractères) ; l'heure vient de la voix. Pas
  d'interpolation présentée comme une heure exacte.
- **Voix Nesalio : ElevenLabs Flash 2.5 via Vercel AI Gateway**
  (`elevenlabs/eleven-flash-v2.5`, option `withTimestamps`). Elle renvoie le MP3
  et l'heure de chaque caractère dans la même réponse. Choisi plutôt que Google
  WaveNet pour garder le routage et l'authentification du Gateway. L'ancien TTS
  Gemini ne renvoie pas d'horodatage.
- **Filet de sécurité (décidé et fait le 2026-11-08)** : la leçon ne s'arrête
  jamais pour une raison de synchro. Un geste sans heure fiable n'est jamais
  présenté comme synchronisé : il est **reporté à la fin de son passage** (après
  l'explication, jamais avant) et signalé. Si la voix échoue deux fois, option A
  choisie par l'utilisateur : passage **sans voix**, texte en sous-titre, tous
  les gestes appliqués, attente du temps de lecture. Pas de voix du navigateur.

### Points ouverts (prochaine étape)

1. **À l'écoute de l'utilisateur** : la voix ElevenLabs par défaut (aucun
   identifiant de voix fixé) est-elle française et naturelle ? Les nombres et
   symboles (`π`, `x²`, `−2`, `50 %`, `PGCD`) sont-ils bien prononcés ? Clips
   dans `analyses/voix-reelle-2026-11-08/` (numérotés comme le corpus du banc).
2. Les avertissements de lecture (`onWarning`) ne s'affichent que sur
   `/dev/nesalio` : à brancher sur les journaux de séance lors de la bascule.
3. Étiquette attachée qui chevauche les axes, texte trop petit quand la caméra
   dézoome : chantiers de placement et de caméra, reportés.
4. Futur prompt du générateur : un geste part sur le mot qui nomme l'objet, et
   une formule prononcée morceau par morceau se déclare avec `parts` et s'écrit
   partie par partie (`write.part`).
5. Visuel non contrôlé image par image : on sait que le geste part à l'heure du
   repère sur l'horloge audio, pas encore qu'il est lisible à l'écran.

### Tester en réel

- Voix seule : `VOIX_REELLE=1 npx vitest run tools/eval/voix-reelle.test.mjs`
  (dans `app/`, coût réel faible). Ignoré par la suite normale.
- Lecteur : `.claude/launch.json` (non versionné) lance `next dev` avec
  `DISABLE_AI=0` et un `NESALIO_DEV_ACCESS_TOKEN` de test ; le cookie
  `nesalio_dev` (HMAC du jeton, voir `server/devAccess.ts`) ouvre `/api/voice`
  sans compte Clerk. Puis `/dev/nesalio`, charger une leçon JSON.
- Le jeton `VERCEL_OIDC_TOKEN` de `app/.env.local` expire environ 12 h après
  `vercel env pull`.

---

## Journal

### 2026-11-08 nuit — Claude Code : décisions pour supprimer l'ancien système
- Décision utilisateur : la génération en deux temps est **mise de côté** (« plus tard ») ; elle reste dans le code,
  désactivée (`NESALIO_DEUX_ETAPES`). Mesure : 3 leçons sur 10 au bout sur les nouvelles questions, première tranche
  après 7 à 18 s : pas utilisable telle quelle.
- Décisions pour la suppression de l'ancien système (inventaire : `agent3-inventaire.md`) : commit du travail actuel
  d'abord ; **mode démonstration sans IA supprimé** (sans modèle, la page dit que Nesa n'est pas disponible) ;
  **inspection JSON `?inspect=1` retirée** (`/dev/nesalio` reste l'outil de test) ; **docs de l'ancien système
  archivées** (pas supprimées).

### 2026-11-08 nuit — Claude Code : deux temps mesurés, fiabilité, nouvelles questions
- Deux temps (`dps1-*`, `dps2-*`) : première tranche après **6 à 19 s** (un appel `pdt1-*` : 1,6 à 7,8 s) ; 4 leçons
  sur 16 en échec (dérivée ×2, nombre dérivé, portée) contre 2 sur 8 en un appel (dérivée, portée). Qualité pas
  encore notée.
- Causes des échecs (journaux) : surtout la forme sur des leçons plus riches — parties d'une formule qui ne la
  redonnent pas (morceau manquant, espacements LaTeX `\;` `\quad`), repère copié avec une autre casse ou un autre
  accent, deux objets JSON collés sur une ligne, objets non déclarés.
- Corrigé (`normalize.ts`, `validate.ts`, `generator.ts`), tests qui échouent sans : formule dont les parties ne
  la redonnent pas ou ne sont pas affichables seules → **formule déclarée écrite d'un coup** sur le mot de la
  première partie, les suivantes la surlignent (ce que voit l'élève reste la formule déclarée) ; espacements LaTeX
  ignorés dans la comparaison ; repère retrouvé sans tenir compte de la casse, des accents et de l'apostrophe (si une
  seule occurrence) ; objets JSON collés lus séparément (`topLevelObjects`).
- Grille d'évaluation rigoureuse et 10 nouvelles questions (agent) : `grille-et-questions.md` dans le dossier de
  notes (exactitude 20 %, une erreur grave plafonne la note à 50 ou 30 sur 100).
- Générés sur ces 10 questions : ancien tuteur `nt-*` (`tools/eval/tuteur-reel.test.mjs`, nouvel outil) ;
  Nesalio un appel `nq-*` (avant les corrections de fiabilité ci-dessus : 1 leçon coupée, radian) ; deux temps `nd-*`
  en cours. Notation à l'aveugle avec la grille à suivre.

### 2026-11-08 nuit — Claude Code : génération en deux temps (idée de l'utilisateur)
- Mesure étape 1 : les 16 leçons `pda1-*`, `pda2-*` (pédagogie remise, un appel) sont toutes allées au bout ; notation
  à l'aveugle en cours par un agent (`notation-aveugle/` dans le dossier de notes ; clé de l'ordre gardée hors de ce
  dossier, dans le bloc-notes de la session).
- Idée de l'utilisateur : séparer l'explication et la mise en forme. `server/nesalio/script.ts` : **l'enseignant**
  (règles d'enseignement + guide de la notion + ce que le tableau sait montrer, aucune syntaxe) écrit un script
  « IDÉE CENTRALE / TRANCHE / DIT / TABLEAU » ; **le metteur en page** (le générateur existant, même validation, mêmes
  corrections) le met au format v3.3, phrases mot pour mot. Format JSON et moteur inchangés.
- Réglage `NESALIO_DEUX_ETAPES=1` (route), **désactivé par défaut** tant que la mesure n'a pas tranché.
  Version 1 : le metteur en page attend le script entier (premier son plus tard) ; à optimiser si le gain est réel.
- Tests `generator.test.ts` (2) ; `lecon-reelle.test.mjs` : `DEUX_ETAPES=1`, et le journal note le mode et le délai
  de la première tranche. `tsc` OK.
- En cours : `dps1-*`, `dps2-*` (deux temps) et `pdt1-*` (un appel, pour les délais).
- **Résultat de la notation à l'aveugle** (un agent, 8 critères, 32 versions, `notation-aveugle-resultats.md`) :
  ancien tuteur 3,98 ; Nesalio avant 3,58 ; **Nesalio avec la pédagogie remise 4,16** (tirages 4,08 et 4,23).
  Dérivée 3,0 → 4,25 ; nombre dérivé 2,75 → 4,06 ; (x + 5)² 3,62 → 4,5. Reste faible : la portée d'un projectile
  (3,31 ; deux erreurs de physique dans les nouveaux tirages). Défaut le plus courant, tous systèmes : le tableau ne
  suit pas toujours la parole (étape dite non écrite, étiquette annoncée non montrée). Deux tirages, un correcteur :
  indicatif.

### 2026-11-08 nuit — Claude Code : qualité pédagogique, étape 1 (agents + pédagogie rendue au générateur)
- L'utilisateur a jugé l'explication de « la dérivée » catastrophique, moins bonne qu'avant. Trois agents lancés
  (rapports dans le dossier de notes partagé `side-session-notes/local_3a01ca48-…/`) :
  `agent1-comparaison.md` (8 questions, mêmes modèle : ancien tuteur 4,0/5, Nesalio 3,3/5 ; dérivée coupée en route
  mais annoncée « fin » ; nombre dérivé de x² en 2 dit « deux » ; complétion du carré fausse) ;
  `agent2-diagnostic.md` (le prompt Nesalio n'a gardé qu'environ 5 % de pédagogie ; les guides par notion de l'ancien
  tuteur, `server/tutor/domains/`, ont disparu) ; `agent3-inventaire.md` (ancien code : ~140 fichiers, ~17 400 lignes,
  passerelles à couper d'abord, 8 décisions — suppression reportée après la remise à niveau de la qualité).
- Décision utilisateur : **ne pas modifier la structure du JSON** (format v3.3). Tout se fait dans les consignes.
  (`matrix.row_labels`, ajouté plus tôt et facultatif, reste.)
- Fait : `generator.ts` n'annonce plus « fin » pour une leçon arrêtée sur un refus (erreur `incomplete`, message pour
  l'élève ; la page affichait déjà « L'explication s'est arrêtée en route »). Test mis à jour.
- Fait : `server/nesalio/pedagogy.ts` : `TEACHING` (règles du tuteur : public québécois, idée centrale, justifier,
  conditions avant la formule, exemples où ça se voit, le tableau explique, résultat complet) remplace l'ancien `ROLE` ;
  6 guides par notion traduits en objets v3.3 (dérivée : sécantes 4 → 3 → 2,5 → 2 et paramètre q ; fonctions ;
  algèbre ; polynômes avec modèle d'aire ; géométrie ; physique), **joints à la question** seulement s'ils
  correspondent (le prompt système reste identique pour toutes les questions) ; un seul récapitulatif ; deux lignes
  pédagogiques dans la vérification finale ; une **leçon complète d'exemple** (« Pourquoi 2⁰ = 1 », hors des questions
  mesurées), validée par le moteur dans `pedagogy.test.ts`.
- En cours : mesure sur les 8 questions de l'agent 1, deux tirages chacune (`analyses/generations/pda1-*`, `pda2-*`).

### 2026-11-08 soir — Claude Code (agent) : comparaison ancien tuteur / Nesalio, 8 questions réelles
- Même modèle (DeepSeek V4.1 Flash, Gateway), un tirage par question. Nesalio : `lecon-reelle.test.mjs`
  (`analyses/generations/cmp-*.json|journal|lisible.txt`) ; ancien : premier tour de `tutorEvents`
  (`cmp-ancien-*.json|txt`), script temporaire supprimé. Rien modifié dans `app/src`.
- Notes moyennes (8 critères, 1 à 5) : **ancien 4,0, Nesalio 3,3** ; l'ancien gagne 7/8 (Nesalio gagne les zéros :
  l'ancien s'arrête sur un QCM avant le calcul). Écarts : intuition 2,6 contre 4,0, tableau 2,8 contre 4,0,
  exactitude 3,4 contre 4,6.
- Graves : « dérivée » arrêtée après 2 tranches sur refus mais terminée par `end` (`generator.ts` l. 210-213) :
  jamais dit ce qu'est une dérivée ; nombre dérivé de x² en 2 annoncé « deux » (vrai : 4), tangente fausse ;
  complétion : règle retenue fausse (« moitié… on l'ajoute puis la retire ») ; formule cassée au tableau ((x+5)²).
  Cause probable : le prompt Nesalio n'a que 6 lignes de pédagogie et pas les guides par domaine de l'ancien
  (`server/tutor/domains/`, dont la recette sécante → tangente).
- Rapport complet : `AppData/Roaming/Claude/side-session-notes/local_3a01ca48-…/agent1-comparaison.md`.
- Prochaine étape (à décider) : ne plus finir par `end` une leçon tronquée ; réinjecter les guides par domaine.

### 2026-11-08 soir — Claude Code : page élève Nesalio vérifiée dans le navigateur
- L'utilisateur s'est connecté (Clerk) dans le navigateur intégré ; essais sur `localhost:3000/` (serveur déjà lancé).
- Vérifié, question « Comment je résous 2x + 3 = 11 ? » : accueil sans promesse d'interruption, préparation,
  explication sous-titrée, titre dans la barre, résultat « x = 4 » au tableau, écran de fin (autre question, Revoir,
  Nouvelle notion). Questionnaire « après essai » : 4 s après la fin, une fois par visite (comportement existant).
- **Pause** : phrase et tableau figés 6 s ; reprise de l'audio au même endroit (4,41 s). **Son coupé** : audio muet,
  la leçon continue au même rythme, passages suivants muets aussi ; réactivé ensuite. (Vérifié en lisant l'état des
  éléments audio de la page.) **Revoir** : aucune nouvelle requête `/api/nesalio`. **Nouvelle question** en cours :
  retour à l'accueil, aucun audio qui continue. **Réseau coupé (simulé)** : message pour l'élève + Réessayer.
- Trouvé en réel : « C'est quoi une fraction ? » refusée trois fois (parts « 3 » et « 4 » pour `\frac{3}{4}`) →
  `normalize.ts` écrit d'un coup une fraction découpée en numérateur/dénominateur (l'étape suivante la surligne),
  consigne de prompt ajoutée ; tests (échoue sans). Réessayé : leçon jouée, fraction entière.
- Téléphone (375 × 812) : fonctionne, mais tableau petit (format 16:9 réduit à la largeur) — cadrage téléphone
  reporté, comme décidé. « Nouvelle question » en double (barre + carte) → retiré de la carte.
- Ancien système : intact sur `?inspect=1` (texte d'origine). `NESALIO_EXPLICATION=0` couvert par test seulement
  (le serveur en cours appartient à une autre session : pas relancé avec ce réglage).
- `tsc` OK, **663 tests**, 5 ignorés.
- Restent : micro (question dite) pas essayé dans le navigateur intégré ; un texte manuscrit « y_S » ; cadrage téléphone.

### 2026-11-08 soir — Claude Code : bascule, étape 3 (page élève branchée, pas encore vue)
- `engine/nesalioSession.ts` : séance d'explication (question → leçon en flux → tableau), pause, son coupé,
  « Revoir l'explication » sans nouvel appel, messages d'erreur pour l'élève (hors ligne, modèle, arrêt en route :
  ce qui a été joué reste), nouvelle question qui arrête la précédente, contexte du signalement. Tests
  `nesalioSession.test.ts` (8).
- `ui/NesalioApp.tsx` (tableau plein écran entre la barre et la carte, un rendu par explication) et
  `ui/NesalioDock.tsx` (carte de Nesa : sous-titre, Pause/Reprendre, Nouvelle question ; fin : autre question,
  Revoir, Nouvelle notion ; erreur : Réessayer / Autre question). Parler au micro pendant l'explication met en pause.
- Réutilisés : `TopBar` (son coupé → commande), `FeedbackButton` (accepte toute séance avec `recentContext`),
  `AfterTrialQuestions`, `StartScreen` (texte sous le titre en option : plus de promesse d'interruption).
- `app/page.tsx` : `explainerFor` choisit `NesalioApp` ou `TutorApp` ; l'accès par compte est inchangé.
- `tsc` OK, **661 tests**, 5 ignorés.
- **Pas encore vérifié à l'écran** : la page `/` demande une connexion Clerk (code par courriel) ; l'IA ne peut pas
  saisir d'identifiants → l'utilisateur doit se connecter dans le navigateur intégré.

### 2026-11-08 soir — Claude Code : les 5 leçons corrigées, vues à l'écran
- Filmé `analyses/videos/r-{sommet,equation,pythagore,fractions,proportion}.webm` (images dans `frames-r-*`) :
  5 lectures complètes, voix, aucun avertissement, aucune erreur de page (l'erreur MathJax de la fois précédente
  n'est pas revenue). Premier son 1,8 à 3,0 s (leçon déjà générée).
- Vu : axes chiffrés ; sommet complet « S(1 ; −4) », une seule parabole ; « x = 4 » écrit ; tableau quadrillé avec
  intitulés ; plus d'objet coupé au bord. Un objet peut apparaître au bord une seconde pendant que la caméra le
  rejoint (fractions, 61 s → 63 s) : mouvement, pas coupure.
- Reste mineur : un texte manuscrit qui écrit « y_S » tel quel (LaTeX dans un texte) ; récapitulatif du sommet un
  peu dispersé (formules à des places éloignées).

### 2026-11-08 soir — Claude Code : bascule, étapes 1-2 (pause/son, réglage)
- `engine/nesalioControl.ts` : commande de lecture (pause, son coupé) partagée page ↔ lecteur. `playNesalioStream`
  (option `control`) attend la reprise avant chaque passage ; les silences (`pausableSleep`) ne s'écoulent pas en
  pause ; la commande est passée à la voix. `services/voice/nesalioClip.ts` : l'audio s'arrête, repart et se tait
  avec la commande (un `play()` interrompu par une pause n'est pas une erreur). Tests `nesalioControl.test.ts` (3),
  chacun échoue sans sa partie. **La partie audio du navigateur n'a pas de test unitaire** : à vérifier à l'écran.
- `server/explainer.ts` : `explainerFor` → `nesalio` par défaut si le modèle est configuré ; `tuteur` si
  `NESALIO_EXPLICATION=0`, sans IA, ou en inspection JSON. Documenté dans `.env.example`. Test `explainer.test.ts`.
- Prochaine étape : la page élève (composant d'explication Nesalio, carte de Nesa, boutons validés).

### 2026-11-08 soir — Claude Code : plan de bascule de la page élève validé
- Plan écrit puis validé par l'utilisateur : [`app/docs/plan-bascule-nesalio.md`](app/docs/plan-bascule-nesalio.md).
- Décisions : explication seule (pas de tuteur) ; pendant l'explication sous-titre, Pause/Reprendre, son coupé,
  « Nouvelle question » ; à la fin « Une autre question ? », « Revoir l'explication », « Nouvelle notion » ;
  « Attends, je comprends pas » retiré pour l'instant ; téléphone accepté tel quel (à vérifier) ; Nesalio par
  défaut, ancien système en secours par un réglage. Sans IA (démo) et inspection JSON : ancien système.
- Constaté en lisant le code : le lecteur Nesalio ne sait ni mettre en pause ni couper le son (à ajouter).
- Prochaine étape : pause et son coupé dans le lecteur Nesalio (avec tests), puis la page.

### 2026-11-08 soir — Claude Code : deuxième essai par tranche, nouvelles leçons
- Nouvelles générations `analyses/generations/r-*.json` (prompt corrigé) : sommet complet et cohérent (une seule
  parabole, x_S = 1, y_S = −4, « S (1 ; −4) » écrit) ; mais équation et proportionnalité arrêtées : la correction
  d'une tranche réparait une erreur et en apportait une autre.
- `generator.ts` : `MAX_ATTEMPTS` = 2 corrections par tranche (toujours `MAX_REPAIRS` = 3 par leçon).
  `normalize.ts` : un geste `after:X` dont X est dans un passage précédent de la tranche part au début du sien
  (X est fini) ; une action introuvable reste refusée. Tests (2), chacun échoue sans sa correction.
- Régénérées : équation (4 tranches, « x = 4 » écrit), proportionnalité (5 tranches, tableau avec `row_labels`).
- `tsc` OK, **647 tests**, 5 ignorés. Les 5 leçons `r-*` sont en cours de tournage (`analyses/videos/r-*.webm`).

### 2026-11-08 soir — Claude Code : nombres sur les axes, tableau de valeurs, résultat complet
- **Axes chiffrés** : `axisNumbers` (`measurement.ts`) donne les nombres des graduations (sans 0, virgule et signe
  moins français), sous l'axe x et à gauche de l'axe y ; la mesure des axes réserve leur bande ; `NesalioProjection`
  les dessine en texte (pas les nombres de manim-web : tournés sur l'axe y et rendus par MathJax). Test `axes.test.ts`.
- **Tableau de valeurs** : `matrix.params.row_labels` (contrat, un intitulé par ligne) → dessiné en tableau quadrillé,
  intitulés en première colonne (`tableLayout`/`tableRows`, partagés par la mesure et le dessin). Sans `row_labels`,
  une matrice reste écrite comme avant. Consigne de prompt : un tableau de valeurs = un matrix avec row_labels.
  Test `table.test.ts`.
- **Prompt** : répondre complètement (résultat final écrit au tableau : « x = 4 », « S(3 ; −4) »), un seul exemple
  du début à la fin. Tests dans `prompt.test.ts`.
- Chaque correction neutralisée a fait échouer son test, puis a été remise. 177 tests ciblés OK, `tsc` OK.
- Pas encore vu à l'écran : rendu des nombres et du quadrillage (à vérifier sur les nouvelles vidéos).

### 2026-11-08 soir — Claude Code : cadrage qui coupait des objets encore au tableau
- Décision utilisateur : corriger les défauts vus avant de brancher Nesalio dans la page élève.
- Reproduit sans navigateur (lecture des 5 leçons `q-*` avec un faux clip) : la caméra cadrait ce qui apparaît et
  laissait à moitié coupé un objet encore visible (Pythagore : le triangle ; proportionnalité : le premier tableau ;
  fractions : les fractions estompées), sans avertissement car ce n'était pas une cible.
- `fitSceneCamera` (`sceneState.ts`), option `avoidCutting` passée par `planFocus` (`nesalioPlayback.ts`) : un objet
  visible que le cadre couperait le rejoint si tout reste lisible (zoom ≥ minimum) ; d'abord les non estompés, puis
  les estompés. Un objet entièrement dehors reste dehors. Exception : la figure d'où l'on zoome sur un détail
  (même repère que la cible), pour garder le zoom sur un sommet.
- Tests `cameraDetails.test.ts` (2) : le premier échoue sans l'option, le second sans l'exception. `tsc` OK.
- Après correction, plus rien de coupé sur Pythagore et proportionnalité ; reste fractions : la question en encadré,
  trop large pour tenir avec le reste au zoom minimum (coupée en haut).
- Pas encore revu à l'écran (refilmer après les autres corrections).

### 2026-11-08 soir — Claude Code : qualité des explications vue à l'écran (avant bascule)
- Décision utilisateur : pas de tuteur pour l'instant ; l'élève pose une question, Nesalio l'explique.
  Vérifier la qualité avant de brancher Nesalio dans la page élève.
- Nouvel outil `app/tools/eval/lecon-reelle.test.mjs` : génère par le vrai chemin (`generateNesalio`,
  corrections comprises) et enregistre la leçon jouable (`LECONS_REELLES=1 LECONS="nom=question;…"`).
- 5 leçons `analyses/generations/q-{sommet,equation,pythagore,fractions,proportion}.json`, toutes complètes ;
  filmées (`analyses/videos/q-*.webm`, images dans `frames-q-*`) : lecture complète, voix, aucun avertissement.
  Erreur de page « MathJax retry » sur fractions (effet non identifié).
- Calculs tous justes. Défauts vus :
  - **cadrage** : objets coupés au bord (Pythagore : triangle et « c = 5 » ; fractions : anciennes formules à moitié
    visibles en haut ; proportionnalité : « ce (km) » coupé en haut à gauche) malgré l'absence d'avertissement `framing` ;
  - axes de graphique sans nombres (sommet) ; tableau de valeurs sans grille, intitulés au-dessus/au-dessous ;
  - formules empilées dans un ordre différent de la parole (sommet) ;
  - leçons qui s'arrêtent avant le résultat complet : ordonnée du sommet absente, « x = 4 » jamais écrit (équation) ;
  - une faute de grammaire (« seules la dernière colonne »).
- Prochaine étape : décision utilisateur — corriger ces défauts avant la bascule, ou brancher d'abord.

### 2026-11-08 soir — Claude Code : fiabilité du générateur (leçons qui s'arrêtaient)
- **Mesure.** Nouveau banc `app/tools/eval/fiabilite-generateur.test.mjs` : 10 questions variées × 2,
  par le vrai chemin de la route (`generateNesalio`, corrections comprises, réflexion `none` comme en direct).
  Lancer dans `app/` : `FIABILITE=1 SORTIE=<nom> npx vitest run tools/eval/fiabilite-generateur.test.mjs`.
  Résultats dans `analyses/fiabilite/<nom>.json` (+ sortie brute de chaque appel).
- **Avant : 6/20 leçons complètes** (`avant.json`). Après lot 1 : 16/20 (`apres.json`). **Après lot 2 : 20/20**,
  chacune de 4 à 6 tranches (`apres2.json`). Mêmes questions, même modèle. Le modèle varie d'un appel à l'autre :
  20/20 sur une série n'est pas une garantie.
- **Cause n° 1 trouvée (ligne d'en-tête illisible, point ouvert 2)** : le modèle oublie la dernière `}` de la ligne
  `lesson` (le parseur échoue à la dernière position). L'en-tête jamais accepté n'était pas rejoué ; la correction
  ne visait que la tranche (« la ligne lesson doit venir avant ») : 11 des 14 échecs de la mesure « avant ».
- **Lot 1** (`server/nesalio/generator.ts`, `prompt.ts`, nouveau `domain/nesalio/normalize.ts`, `validate.ts`) :
  `closeJsonLine` complète les `}`/`]` manquants en fin de ligne (seulement si la ligne finit par `}`/`]`, hors
  chaîne, sans fermeture mal appariée) ; en-tête refusé ou absent → message dédié qui redemande la ligne `lesson` ;
  **une correction par tranche, au plus `MAX_REPAIRS` = 3 par leçon** (avant : une seule par leçon) ;
  `normalizeSlice` répare sans appel : repère nommé sans préfixe (`cue:isoler` → `c_isoler`, si un seul candidat),
  geste sans heure → `beat:start`, opérateurs oubliés entre les parties d'une formule (si l'écart n'est fait que
  d'opérateurs : la formule affichée reste exactement celle déclarée), découpe en une seule partie, `null`.
  Refus plus précis : repères du passage et objets existants nommés dans le message.
- **Lot 2** : heure écrite en objet (`{"cue": …}`), intervalle à moitié (`start` seul → `at`, `end` seul → depuis
  le début du passage), `part` sur une formule non découpée → écrite en entière, `pause_after` mal placé, identifiant
  accentué (`b_monté` → `b_monte`), expression en x/t dans `math_context` retirée de l'en-tête (une tranche qui s'y
  réfère reste refusée). Constaté : après la correction d'une tranche du début, le modèle réécrivait cette seule
  tranche puis s'arrêtait (leçons d'une tranche « complètes ») → `MIN_SLICES` = 3 : après une correction, si la
  leçon a moins de 3 tranches, on demande une fois la suite.
- **Non relâché** : formule fausse, cible inexistante, objet visé après `remove`, partie qui coupe un exposant
  de sa base, repère ambigu : toujours refusés puis renvoyés au modèle.
- Tests : `normalize.test.ts` (12), 11 nouveaux cas dans `generator.test.ts`. Chaque correction des deux lots
  neutralisée séparément a fait échouer son test, puis a été remise (la vérification du lot 2, interrompue une
  première fois, a été refaite en entier ; elle a révélé que la transmission de l'état à `normalizeSlice` par le
  générateur n'était pas testée → test ajouté). `tsc` OK, **636 tests** (614 au départ), 5 ignorés.
- Pas vérifié : lecture à l'écran des leçons de `apres2` (seulement validées par le moteur) ; flux arrêtés sur une
  erreur du générateur avant toute lecture (point 3) : jamais reproduit sur 60 générations.
- Refus restants les plus fréquents (corrigés par le modèle) : parties qui oublient « y = » ou un morceau de texte.
- Prochaine étape possible : rejouer quelques leçons `apres2` sur `/dev/nesalio` ; consigne de prompt sur les parties.

### 2026-11-08 soir — Claude Code : petits restes caméra (5.6)
- `focus_padding` de la leçon enfin lu : `FOCUS_PADDING` (`nesalioPlayback.ts`),
  `md` = 0,9 = marge d'avant, donc aucun changement pour les leçons existantes.
- Étiquettes coupées au bord : reproduit par un test (cadrage du modèle sur une
  courbe seule → l'étiquette du point posé dessus sortait du cadre). Correction dans
  `fitSceneCamera` (`withFrames`) : une figure est cadrée avec les points de son
  repère situés dans sa zone, donc avec leurs étiquettes. Un point seul ne tire
  pas la figure entière (le zoom sur le sommet reste un zoom).
- Tests `domain/nesalio/cameraDetails.test.ts` (2) ; l'un échouait avant la
  correction, l'autre échoue si la marge est ignorée. `tsc` OK, 614 tests.
- Rejoué et filmé `retour-parabole.json` (`analyses/videos/retour-parabole-2.webm`) :
  zoom sur le sommet et retour identiques à avant, aucun avertissement.
- Pas fait (décidé dans la fiche) : `camera.follow` / `camera.hold`, sans besoin observé.
- Reste caméra : écran de téléphone (5.4), mis de côté par l'utilisateur.

### 2026-11-08 soir — Claude Code : 5.5, plage d'un paramètre animé
- Décision utilisateur : pas de téléphone (5.4) pour l'instant.
- `measurement.ts` : `parametersOf` (paramètres dont dépend un objet) et
  `parameterReserve` (zone couverte par une courbe sur la plage de ses
  paramètres, coupée aux axes) → `Measurement.reserve` des courbes.
- `nesalioPlayback.ts` (`planPassage`) : avant un `animate_parameter`, si la zone
  réservée des objets dépendants et de leurs axes n'est pas visible, cadrage
  automatique `plage_<id>`.
- Vraie génération « coefficient a » (`analyses/generations/parametre-a.json`) filmée
  (`analyses/videos/parametre-a.webm`) : la parabole reste entière pendant que `a`
  varie, mais avertissement `framing` à chaque passage : le modèle avait pris des
  axes y de −8 à 8 (16 unités), plus que les 15 visibles au zoom minimum.
  → Prompt : axes au plus 24 × 13 unités. Nouvel essai (`parametre-a2`) : axes
  y de −6 à 6, lecture filmée **sans aucun avertissement** (`parametre-a2.webm`).
- Même essai : tranche refusée car le modèle a omis `introduces` (déjà vu par Codex
  sur « triangle »). Décision : `introduces` facultatif, `[]` par défaut (contrat et
  `capabilities.ts`) ; une tranche peut ne travailler que sur des objets existants.
- Tests `domain/nesalio/dynamic.test.ts` (3), chacun échoue sans sa correction.
  `tsc` OK, 612 tests.
- Pas vu image par image : les animations de `a` (seulement une image à mi-course).
- Prochaine étape : petits restes (5.6) ou fiabilité du générateur, au choix de l'utilisateur.

### 2026-11-08 soir — Claude Code : reprise après Codex, 5.3 vérifiée en vidéo
- L'utilisateur redonne la main à Claude Code. Codex s'était arrêté en 5.3, code
  et tests écrits, vérification finale non faite. Relu le code (`planPassage`,
  `planFocus`, `restoreGeometry`, validation, ordonnanceur) : rien à corriger.
- `npx tsc --noEmit -p .` et `npx vitest run` : OK, 609 tests, 4 ignorés.
- Nouvel outil `app/tools/eval/video-nesalio.mjs` : rejoue une leçon sur
  `/dev/nesalio`, capture les images de Chrome (CDP screencast) et assemble une
  vidéo → `analyses/videos/<nom>.webm` + `<nom>.passages.json`. Aucun
  téléchargement : Chrome de la machine + ffmpeg du cache Playwright.
- Rejoué `analyses/generations/retour-parabole.json` (générée par le modèle, non
  retouchée) : 11 passages, « Explication terminée », aucun avertissement, aucune
  erreur de page. Vidéo : `analyses/videos/retour-parabole.webm` (1 527 images).
  Vu image par image le retour `camera.restore` (32,35 s → 33,55 s) : zoom sur le
  sommet, position intermédiaire, puis courbe entière, sans saut.
- Pas regardé image par image : le zoom d'aller (22 s) et les autres mouvements
  (ils sont dans la vidéo). Une seule leçon avec `camera.restore` a été rejouée ;
  l'essai « triangle » de Codex s'était arrêté avant le retour.
- Prochaine étape : 5.4 (écran de téléphone / format automatique), puis 5.5.

### 2026-11-08 — Codex : 5.3, régressions et génération réelle
- Tests ajoutés dans `contract.test.ts`, `nesalioPlayback.test.ts` et `prompt.test.ts`. TypeScript et 48 tests ciblés passent. Sept neutralisations ont fait échouer les tests attendus : unicité, ordre des repères, ordre d'exécution, membre de groupe remplacé, position de secours, cible sortie du tableau et exemple. Les corrections sont remises.
- `analyses/generations/retour-parabole.json` (quatre tranches valides) contient la vue nommée, le détail et `camera.restore` sur « revenons », dans des tranches distinctes. La génération triangle s'est arrêtée avant le retour sur une tranche sans `introduces`. Aucun fichier de leçon retouché.
- Suite : terminer le rejeu de la parabole et la suite complète, puis consigner ce qui a été observé à l'écran.

### 2026-11-08 — Codex : 5.3, contrat et lecteur reliés
- Accord utilisateur : `camera.focus.save_as` mémorise les cibles, le choix de `bounds` et la position calculée de secours. `camera.restore` recadre les cibles actuelles avec la trajectoire et l'ordonnancement de la 5.2.
- Contrat, vocabulaire et validation Nesalio étendus. `scheduler.ts` ordonne une sauvegarde et son retour dans le même passage, et reporte le retour si la sauvegarde ne peut pas le précéder sur l'horloge audio. `sceneState.ts` et `nesalioPlayback.ts` conservent puis relisent les cadrages. `prompt.ts` montre un détail de courbe puis le retour sur « revenons ».
- TypeScript et les 42 tests ciblés existants passent, y compris la validation de l'exemple modifié. Les nouveaux cas de régression sont écrits. Aucun retour vérifié à l'écran à ce stade.
- Suite : vérifier les nouveaux tests et les neutralisations, puis rejouer une vraie génération qui utilise `camera.restore`.

### 2026-11-08 — Codex : 5.2 vérifiée sur la parabole
- `npx tsc --noEmit -p .` et `npx vitest run` passent sur la version restaurée (603 tests, 4 ignorés).
- Rejoué `analyses/generations/recap-51-sommet.json` tel que généré sur `/dev/nesalio` : lecture complète, 17 réponses voix HTTP 200, aucun avertissement ni erreur de page. Captures intermédiaires consultées pendant le suivi du graphique vers les calculs et le retour demandé vers le graphique. Le relevé navigateur donne des échantillons, sans contrôle image par image de la continuité.
- `app/docs/chantier-camera.md` et `app/docs/nesalio-espace-camera.md` reflètent le fonctionnement. Durée implicite D3 bornée à 300–1 200 ms puis coupée à la fin du clip. Allures choisies d'après les anciens rapports (×0,5 et ×1,875), seuil de 2 % de la largeur et 3 % du zoom. Le zoom reste borné pendant le trajet.
- Suite : faire valider le principe des cadrages nommés pour `camera.restore` (5.3).

### 2026-11-08 — Codex : 5.2, régressions ciblées
- `app/src/engine/nesalioPlayback.test.ts` couvre la trajectoire D3 sur un intervalle explicite, les durées et `after:`, le clip écourté, `instant`, le seuil et deux révélations proches. Les tests ciblés passent.
- Neutralisé séparément la trajectoire, la durée adaptative, le seuil, la réutilisation de la destination et la coupure audio. Les tests attendus ont échoué dans chacun des cinq cas. Les corrections sont remises.
- Seuil retenu : déplacement d'au plus 2 % de la largeur visible et variation de zoom d'au plus 3 %, si les cibles et objets gardés tiennent déjà. Un cadrage instantané reste appliqué. Suite : vérifier le rejeu sur `/dev/nesalio`, puis relancer la suite complète hors de Chrome.

### 2026-11-08 — Codex : 5.2, intégration de D3 au lecteur
- Décision utilisateur : `interpolateZoom` fournit la trajectoire et la durée. La voix reste l'horloge. Dépendance et types ajoutés dans `app/package.json` et `app/package-lock.json`.
- `app/src/engine/nesalioPlayback.ts` planifie les trajets à partir du cadrage au départ, puis recalcule les dépendances `after:` sur la durée obtenue. Les intervalles explicites conservent leurs repères. Le suivi automatique réutilise la destination en cours si elle contient déjà l'objet à révéler.
- `tsc` et 27 tests existants du lecteur, du placement et du déplacement passent. Aucun essai visuel à ce stade.
- Suite : tester les durées, les repères, le seuil et le suivi rapproché, puis les vérifier sur une leçon générée.

### 2026-11-08 — Codex : 5.1 vérifiée sur trois récapitulatifs
- Cadrage de repli validé avec l'utilisateur : révélation, surlignage, dernière cible nommée. Les objets gardés sont ajoutés quand ils tiennent. Consignes du générateur et limites des essais mises à jour dans `app/docs/chantier-camera.md` et `app/docs/nesalio-espace-camera.md`.
- `npx tsc --noEmit -p .` et `npx vitest run` passent sur la version finale (594 tests, 4 ignorés). Les neutralisations ciblées ont fait échouer les cas attendus. Le relancement sans Chrome a levé les trois dépassements de délai vus sous charge.
- Rejoué sur `/dev/nesalio` les trois fichiers `analyses/generations/recap-51-{sommet,proportion,equation}.json`, tels que sauvegardés par `generation-reelle.test.mjs`. Voix HTTP 200, lecture complète, résumés lisibles, aucun `framing` au dernier passage. La proportionnalité dégage une partie avant le résumé puis retire encore des éléments pendant celui-ci. Captures avant/après consultées, transitions non suivies image par image.
- Les essais en flux ont aussi montré des tranches refusées et des écarts au prompt. Le bon cadrage sur les trois rejeux ne garantit pas le respect de la consigne à chaque génération.
- Suite : faire valider pour la 5.2 une durée liée à la distance et au changement de zoom, avec un seuil pour éviter les petits recadrages.

### 2026-11-08 — Codex : 5.1, lectures en cours et comportement variable du modèle
- Le banc réel a sauvegardé `analyses/generations/recap-51-sommet.json` et `recap-51-proportion.json` (5 et 4 tranches valides, aucun refus). Les deux dégagent le tableau au bon passage. Rejeu des fichiers d'origine lancé sur `/dev/nesalio`.
- Un nouvel essai en flux sur l'équation a bien dégagé le tableau avant le récapitulatif, puis a effacé la méthode pendant celui-ci. Capture finale vide, aucun `framing` : cela ne compte pas comme une réussite. Deux autres flux se sont arrêtés sur une erreur du générateur avant toute lecture.
- `app/src/server/nesalio/prompt.ts` demande désormais que la composition apparaisse dans la dernière tranche et reste visible à la fin. `prompt.test.ts` couvre cette formulation. Suite : vérifier les captures des rejeux et relancer TypeScript et Vitest.

### 2026-11-08 — Codex : 5.1, premiers récapitulatifs observés
- « Générer et lire » sur `/dev/nesalio` : équation du premier degré et lecture d'une image sur un graphique arrivées au récapitulatif avec voix (HTTP 200) et sans avertissement `framing`. L'équation garde une ligne de calcul collée au résumé. Le graphique dégage deux traits dans le récapitulatif, après son placement. Aucun des deux n'a dégagé le tableau dans le passage demandé.
- Les essais sur le sommet et les triangles se sont arrêtés avant le récapitulatif après des tranches refusées. Ils ne comptent pas pour la preuve finale.
- Renforcé `app/src/server/nesalio/prompt.ts` : le `do` du passage précédent doit dégager chaque objet ou groupe devenu inutile, avec vérification avant d'émettre la tranche. Suite : rejouer cette version avec de nouvelles générations, puis relancer Vitest seul (délais dépassés pendant les lectures parallèles).

### 2026-11-08 — Codex : 5.1, neutralisation isolée des corrections
- Neutralisé séparément la sélection des priorités, l'ajout des objets gardés et la consigne de récapitulatif. Vitest ciblé : respectivement 2, 1 et 1 échecs dans les nouveaux cas. Les trois corrections ont été remises. Le test du prompt vérifie uniquement la consigne dédiée.
- Sur `/dev/nesalio`, trois requêtes de génération ont reçu un statut 200. Le premier relevé du flux par Playwright a échoué, ce qui ne permet pas de conclure sur les derniers passages.
- Suite : relever le flux depuis le navigateur et capturer les tableaux finaux lors de trois nouvelles lectures. Relancer la suite sur les corrections restaurées.

### 2026-11-08 — Codex : 5.1, correction et suite locale
- `app/src/server/nesalio/prompt.ts` demande une composition courte et le dégagement par `fade_out` ou `remove` dans le dernier passage de l'avant-dernière tranche. Aucun exemple ajouté. `app/src/engine/nesalioPlayback.ts` choisit la priorité selon les gestes du passage. `app/src/domain/nesalio/sceneState.ts` ajoute les objets gardés qui tiennent autour du cadrage retenu et signale les cibles hors champ.
- `npx tsc --noEmit -p .` et `npx vitest run` passent (594 tests, 4 ignorés). Les trois appels directs du banc réel ont échoué à la connexion au Gateway (`EACCES` dans le shell), sans leçon générée.
- Suite : essayer « Générer et lire » sur le serveur de développement déjà actif, puis consigner les derniers passages et leurs avertissements. La 5.1 reste en cours.

### 2026-11-08 — Codex : 5.1, reproduction par les tests
- Ajout de cas dans `app/src/engine/nesalioPlayback.test.ts` et `app/src/server/nesalio/prompt.test.ts`.
- Vitest ciblé sur le code de départ : trois échecs attendus (priorité au surlignage, dernière cible en présence d'un objet gardé, consigne de récapitulatif). La priorité à la révélation passait déjà. Pas encore de vérification en navigateur.
- Accord utilisateur : récapitulatif court, place dégagée dans le dernier passage de la tranche précédente, puis priorité moteur aux révélations, aux surlignages et à la dernière cible dans cet ordre. Les objets gardés restent cadrés s'ils tiennent.
- Suite : appliquer les deux corrections, vérifier leur neutralisation et jouer plusieurs vraies générations.

### 2026-11-08 soir — Claude Code : fiche de passation caméra
- Demande de l'utilisateur : confier la suite de la caméra à une autre IA.
- Écrit `app/docs/chantier-camera.md` : règles de travail, principes à ne pas
  casser, carte du code caméra, comment tester (script, écran, journal serveur,
  pièges), reste à faire dans l'ordre (récap final, mouvements naturels,
  `camera.restore`, téléphone, plage d'un paramètre, petits restes), interdits.
- Constaté en l'écrivant : `camera_policy.focus_padding` et `dynamic_focus_policy`
  sont déclarés dans la leçon mais **lus par aucun code** (marge fixée à 0,9).
- Tableau « État actuel » corrigé (le générateur était marqué « pas commencé »).
- Section « État dans le moteur » de `nesalio-espace-camera.md` mise à jour.
- Rien de neuf dans le code ; rien commité.

### 2026-11-08 soir — Claude Code : move, to_edge, to_corner
- Placements `{to_edge: dir, gap?}` et `{to_corner: "top_left"|…, gap?}` (contrat
  `Layout`, utilisables en `layout` et dans `move`). Résolus **une fois** contre
  ce que voit l'élève (`visibleArea` = cadre de la caméra, sa destination si elle
  bouge), marge `md` par défaut ; ensuite position fixe sur le tableau (spéc. §15).
  `to_edge` garde l'autre coordonnée (comme Manim). `positionFor` étendu,
  `placeOnScreen` (glisse le long du bord si quelque chose y est).
- `move {target, to}` : emporte étiquettes et membres de groupe ; des **axes
  emportent toutes les figures de leur repère** et le décalage du repère suit
  (`movedObjects`, `shiftObjects`). Destination calculée une fois au début du
  geste (`resolveMoves` dans le lecteur, `moveShift`) pour que la caméra qui bouge
  ne la change pas. Mouvement en douceur, 700 ms (400 / 1 100). Validation : la
  référence de `to` doit exister, pas soi-même.
- Rendu : si seule la position change, les objets dessinés sont **décalés**
  (`shift`) au lieu d'être reconstruits à chaque image.
- Prompt : to_edge/to_corner dans la liste des layouts, règle `move` (formule clé
  dans un coin, rapprocher deux objets).
- Tests `domain/nesalio/move.test.ts` (4). `tsc` OK, 587 tests.
- Vrais essais : (1) « sommet de y = x² − 4x + 1 » refusé 2 fois (« parties bout à
  bout ») → `sameFormula` (validate.ts) tolère les écritures équivalentes
  (`x^{2}`/`x^2`, `−`/`-`, `×`, `\left`/`\right`, espaces) et le message cite les
  deux textes ; relancé : leçon complète, transforms sur place, pas de `move`.
  (2) Question qui pousse au rangement : le modèle écrit `move` → `to_corner`
  (`analyses/generations/coin.json`, tranches toutes valides). Rejouée : la
  formule glisse bien au coin, **mais la courbe suivante est placée ailleurs et
  la caméra la suit : la formule rangée sort de l'écran**.
- Corrections (décision : un objet rangé sur un bord/coin doit rester visible) :
  - `fade_out` **libère la place** comme `remove` (l'objet reste visable, `show`
    le ramène ; risque rare de chevauchement au retour). Décision qui remplace
    « fade_out garde sa place » d'avant ; contrat, vocabulaire, prompt, test à jour.
  - `freeSpot`, 1er bloc d'une tranche : d'abord **le milieu de ce que voit
    l'élève** s'il est libre ; sinon, s'il y a des objets gardés, la meilleure
    place libre sur une grille autour d'eux (zoom le plus grand pour les montrer
    ensemble) ; sinon comme avant.
  - `SceneState.kept` (objets rangés par `move`/layout `to_edge`/`to_corner`,
    `keptInView`) : chaque cadrage (modèle ou suivi) les inclut s'ils tiennent
    lisiblement, sinon priorité aux cibles + avertissement `framing`.
  - Tests ajoutés (place libérée au centre ; formule rangée gardée dans le
    cadre), chacun échoue sans la règle. 590 tests.
- Rejoué `coin.json` : la courbe se trace avec `x = −b/2a` visible à côté. ✔
- Piège rencontré : le shell (Git Bash) mange les `\\` dans les heredocs/printf
  → écrire le LaTeX des tests avec l'outil d'édition, pas par le shell.
- Reste : récapitulatif final trop dézoomé ; `camera.restore` ; cause des
  en-têtes JSON illisibles ; écart vertical parfois grand entre deux étapes.

### 2026-11-08 soir — Claude Code : transform (formule → formule, sur place)
- Choix utilisateur : `transform` avant le récapitulatif final.
- Rendu : `TransformMatchingTex` de manim-web (`transformMismatches: true`) : il
  descend jusqu'aux glyphes, les glyphes identiques glissent, les autres
  apparaissent/s'effacent. Il **modifie** l'objet animé → tourne sur une copie de
  la source dans un `VGroup` (les glyphes qui apparaissent sont ajoutés au parent) ;
  `NesalioProjection.drawMorphs`.
- Lecteur : `NesalioFrame.morphs` ; pendant la métamorphose la source reste
  visible à opacité 0 et la cible invisible ; à la fin, cible visible et source
  **effacée** (comme `remove` : place libérée, interdite ensuite — validation
  idem). Source absente du tableau → la cible s'écrit simplement. Durée 900 ms
  (600 quick, 1 400 slow). Le suivi caméra compte `transform`.
- Placement : la cible d'un `transform` (sans layout) prend la place de la source
  (bords gauches alignés, centrée en hauteur) ; elle ne peut couvrir que la chaîne
  des formules qu'elle remplace (e1 → e2 → e3).
- Validation : source et cible doivent être des `math`, une formule n'est cible
  qu'une fois (`ValidationState.formulas`, `morphed`).
- Prompt : règle « suite de calculs sur la même formule → transform », exemple de
  l'équation réécrit avec `transform`. `layout.reflow` remplace `transform` comme
  exemple de geste non jouable dans deux tests.
- Tests `domain/nesalio/transform.test.ts` (3). `tsc` OK, 581 tests.
- Vrai essai « Comment résoudre 3x + 5 = 17 ? » : `3x+5−5 = 17−5` devient **sur
  place** `3x = 12` (transform joué, pas d'erreur console ; animation elle-même
  non capturée à l'écran, < 1 s). Mais leçon arrêtée avant `x = 4` : tranche
  refusée car le modèle **vise encore une formule qu'il vient de transformer**
  (`highlight eq3` après `eq3 → eq4`). Décision : un geste sur une formule
  remplacée va à celle qui l'a remplacée (`SceneState.replacedBy`, `currentId`,
  `redirect` dans le lecteur ; validation idem via `ValidationState.replacedBy`).
  Un `next_to`/`attachment` sur une formule remplacée reste refusé, avec un
  message qui nomme la remplaçante (la correction du modèle s'en sert).
- Vu aussi : 2 fois sur 4 appels, la **ligne d'en-tête** du modèle est du JSON
  illisible → tranche suivante refusée (« lesson doit venir avant »), une
  correction. Cause non identifiée : le journal coupait la ligne ; il donne
  maintenant le message du parseur, le début et la fin de la ligne.
- 583 tests.
- Vrai essai « Comment résoudre 2x − 7 = 9 ? » après correction : `2x − 7 = 9` →
  `2x = 16` → `x = 8` **au même endroit** par transform, vérification écrite à
  côté, leçon complète, aucun refus au journal, aucune erreur console. Non vu :
  l'animation image par image (les glyphes qui glissent) — seulement avant/après.
- Prochaines étapes possibles : récapitulatif final (cadrage trop dézoomé),
  `move`/`to_edge`/`to_corner`, `camera.restore`, cause des en-têtes JSON illisibles.

### 2026-11-08 soir — Claude Code : caméra qui suit, courbes arrêtées aux axes
- Décision utilisateur : tester avec de **vrais appels** au modèle de l'appli
  (« Générer et lire »), pas avec des leçons retouchées à la main.
- Vrai essai, « Comment trouver le sommet d'une parabole ? » : 1er appel refusé
  deux fois (raisons illisibles dans le journal : `{}`) ; 2e appel joué. Défauts :
  (1) pendant la méthode générale, la caméra reste sur la parabole estompée,
  les formules s'écrivent **hors champ** (le modèle n'a pas mis de `camera.focus`) ;
  (2) la parabole **sort de ses axes** et est coupée en haut du tableau.
- `generator.ts` : le journal écrit maintenant les raisons du refus en texte.
- Suivi automatique (`followReveals`, `engine/nesalioPlayback.ts`) : avant chaque
  `show`/`draw`/`write`, on calcule la caméra du passage à cet instant ; si
  l'objet serait hors cadre, le moteur ajoute un `camera.focus` (600 ms,
  `FOLLOW_MS`) sur les objets visibles de la tranche + le nouveau (priorité au
  nouveau si tout ne tient pas). Aussi en lecture sans voix et pour les gestes
  reportés. Test qui échoue sans le suivi, passe avec.
- Courbe sur des axes (même repère) : coupée au rectangle des axes (+3 %),
  coupe exacte au bord ; mesure (donc cadrage) idem. `PlacedObject.window`,
  4e paramètre `window` de `MeasureObject`. Courbe entièrement hors des axes :
  gardée entière (pas de plantage). Test dans `spaceRules.test.ts`.
- `tsc` OK, 577 tests.
- Vrai essai n°2 (même question) : courbe bien arrêtée aux axes ; la caméra
  descend seule vers `y = ax²+bx+c` puis `x_S = −b/2a`. Nouveau défaut : dans
  l'exemple, graphique + 3 formules empilés en colonne → trop haut pour le 16:9,
  dernière formule coupée (avertissement `framing` : axes2, calc2).
- `freeSpot` : dans une tranche, entre « dessous » et « à droite », on prend ce
  qui garde la tranche la plus proche du format de l'écran (meilleur zoom) →
  graphique à gauche, calculs en colonne à droite. Test (échoue sans : 6 × 13 ;
  passe avec). 578 tests.
- Vrai essai n°3 : suivi correct à chaque passage, formules lisibles, rien de
  coupé pendant les explications. **Reste** : au récapitulatif final, le modèle
  fait `camera.focus` sur tout ce qui a été fait → zoom au minimum (0,6), texte
  petit, haut du graphique coupé. Pistes : rapprocher le résumé (le modèle
  devrait réécrire l'essentiel dans une nouvelle composition, ou `move` /
  `transform` quand ils existeront), ou un cadrage « les cibles actives d'abord ».
- Le 1er appel du jour a été refusé deux fois sans raison lisible ; non reproduit
  depuis. Le journal donne maintenant les raisons s'il se reproduit.
- Prochaine étape : décider avec l'utilisateur (récap final, puis `transform`).

### 2026-11-08 soir — Claude Code : dégager le tableau (dim, fade_out, remove)
- Bilan espace/caméra fait avec l'utilisateur : le manque principal est qu'on ne
  peut rien retirer du tableau. Ordre décidé : 1. estomper/effacer, 2. `transform`
  de formules, 3. `move`/`to_edge`/`to_corner`, 4. `camera.restore`.
- Trois verbes (contrat + vocabulaire, `dim` ajouté au vocabulaire, 81 termes) :
  `dim` (reste visible à `DIM_OPACITY` = 0,3, `show` le ramène), `fade_out`
  (disparaît, garde sa place, `show` le fait revenir), `remove` (disparaît et
  libère sa place, définitif). Les trois emportent les **étiquettes attachées**
  et les membres d'un groupe (`clearedObjects`). Durée par défaut 450 ms.
- Validation : objet effacé par `remove` interdit à partir du passage suivant
  (cible, `next_to`/`attachment`/`frame`, groupe), y compris d'une tranche à
  l'autre (`ValidationState.removed`, `members`).
- Placement : un objet effacé ne compte plus comme obstacle ni dans les boîtes.
  `freeSpot` essaie d'abord la place de la dernière composition (coin haut-gauche) :
  si elle a été effacée, la suivante s'y installe, la caméra ne voyage pas.
- Lecteur : `NesalioFrame.opacity` pendant les fondus ; `remove`/`fade_out`
  appliqués à la fin du fondu. Rendu : `opacity` des mobjects, et par partie pour
  une formule écrite par parties (les parties non écrites restent à 0).
- Prompt : règle « garde le tableau lisible » + `dim` dans l'exemple de l'équation.
- Prompt : une tranche est placée au début de son premier passage → pour lui
  laisser la place, le `remove` va dans le **dernier passage de la tranche
  précédente** (sinon la place n'est libérée que pour la tranche d'après).
- Tests `domain/nesalio/clearing.test.ts` (5). `tsc` OK, 575 tests.
- Écran, vraie voix, `analyses/generations/equation-degager.json` (leçon
  `equation.json` + `dim`/`fade_out`/`remove` ajoutés à la main, et `next_to: eq3`
  du groupe « méthode » retiré, refusé sinon car `eq3` est effacé) : `3x+5=17` puis
  `3x=12` passent en gris lisible, la note de la balance part en fondu, tout
  s'efface à la fin de la vérification, la méthode générale s'affiche seule et
  propre. Aucune erreur console. Non vérifié à l'écran : opacité des axes et
  des points (testée seulement en unitaire) ; le serveur de dev utilisé était
  celui d'une autre session (port 3000).
- Prochaine étape : `transform` des formules en parties (étape 2).

### 2026-11-08 soir — Claude Code : vitesse de la voix, pause_after, surlignage d'une partie
- Retour utilisateur : « l'audio est trop rapide » ; « on met en évidence x »
  surlignait toute l'équation.
- Voix : `synthesizeSpeech({ speed })` envoie `speed` et
  `providerOptions.elevenlabs.voiceSettings.speed` ; le Gateway le respecte
  (0,8 → +18 % de durée) et les horodatages restent exacts. Banc
  `tools/eval/voix-vitesse.test.mjs` → `analyses/voix-vitesse/` (1,0 / 0,9 /
  0,85 / 0,8). **Valeur provisoire `DEFAULTS.nesalioVoiceSpeed = 0.85`, en
  attente du choix de l'utilisateur à l'écoute.**
- `pause_after` exécuté : `PAUSE_MS` = défaut 350 ms, brief 600, normal 1 000,
  long 1 800, après chaque passage. Réintroduit dans le prompt avec son usage.
- `highlight.part` : seule la partie visée change de couleur
  (`NesalioFrame.partHighlights`, `drawParts` recolore ses glyphes). Validation
  comme `write.part` (sans la règle « une seule fois »). Prompt : découper la
  formule en prévoyant ce qu'on désignera. Vérifié à l'écran (`3x` seul en
  violet dans `3x + 5 = 17`).
- `tsc` OK, 570 tests.
- Suite décidée : verbes d'espace manquants, référence 3Blue1Brown
  (`transform` de formules, estomper/effacer, `move`, `camera.restore`,
  `to_edge`/`to_corner`).

### 2026-11-08 soir — Claude Code : fractions, cadrage des axes, consigne de placement
- `NesalioProjection.prepareSlice` : les formules ont une **taille de police**
  commune (calibrée sur la hauteur d'un chiffre, mesurée une fois) au lieu d'une
  hauteur totale fixe → une fraction n'est plus écrasée. Vérifié à l'écran.
- `fitSceneCamera` : cadrer des **axes** inclut les figures de leur repère et leurs
  étiquettes (§10). La priorité du cas impossible n'est pas élargie.
- Prompt : « une nouvelle idée sans layout, le moteur la place dessous ;
  next_to seulement pour commenter un objet précis » ; exemple 1 aligné.
- `tsc` OK, 566 tests.
- Utilisateur : « on n'est pas encore au top sur la gestion de l'espace » →
  prendre les vidéos de Grant Sanderson (3Blue1Brown) comme référence ; verbes
  d'espace non implémentés à traiter ensuite.

### 2026-11-08 soir — Claude Code : placement §1 et §7 (chantier tableau, étapes 2-3)
- Contrat : champ `frame` (figures seulement) et `FIGURE_TYPES`. Validation :
  `frame` sur un texte, vers une figure inconnue, avec `layout`/`attachment` →
  refusé ; dépendance sans cycle.
- `measurement.ts` : `collision` = forme réelle des figures (traits des axes,
  segments des courbes, côtés des polygones, cercle, droites découpées).
- `sceneState.ts` (`introduceSlice`) : `frameOf` / `frameOffset` (repère d'une
  tranche placé comme un bloc), `freeSpot` (zone libre sous la dernière
  composition, sinon à côté), `obstacles` avec les formes réelles, `occupied`
  pour les blocs. `SceneState.frames`, `SceneState.lastComposition`,
  `PlacedObject.frame`. Les 80 tests existants passent sans changement.
- Prompt : le tableau est infini, le moteur place chaque composition ; un repère
  par tranche ; `frame` pour ajouter à un repère précédent.
- Tests `domain/nesalio/spaceRules.test.ts` (6). `tsc` OK, 566 tests.
- Écran, mêmes leçons : logarithme propre (puissances de 10 sous la question,
  axes sous la tranche précédente, `log(a×b)=…` sous le graphe, plus sur l'axe).
  Équation : plus de chevauchement, mais composition serrée car le modèle a mis
  le groupe « méthode » en `next_to` d'une équation au milieu d'une colonne ; et
  la fraction `(c−b)/a` minuscule (hauteur de formule fixe au rendu).
- Restes notés dans `app/docs/nesalio-espace-camera.md` (État dans le moteur).

### 2026-11-08 soir — Claude Code : caméra (chantier tableau, étape 1/5)
- Référence : `app/docs/nesalio-espace-camera.md` (spécification espace et caméra
  fournie par l'utilisateur, renommée Nesalio, + section « État dans le moteur » à
  tenir à jour). Choix confirmé : **tableau infini, positions stables, caméra qui
  se déplace par intention** (pas de cadre fixe).
- `sceneState.ts` : `fitSceneCamera(state, targets, mode, { padding, priority })`
  renvoie `{ state, hidden }`. Zoom borné par `CAMERA_ZOOM` (0,6 à 1,5).
  Cadrage impossible → `priority` cadrée, le reste dans `hidden`.
- `nesalioPlayback.ts` : `frameAt` reçoit un `FrameContext` (measure,
  `layoutFallback` lu dans `camera_policy`, `framing`). `camera.focus` sans `bounds`
  et rien de visible → `layout_bounds`. Priorité = cibles que le passage révèle,
  sinon la dernière. Avertissement `framing` une fois par action et par passage.
  `target_state` pendant une transition (`RuntimeState`).
- Tests : bornes de zoom, cas impossible, repli `layout_bounds` dans le lecteur.
  `tsc` OK, 560 tests.
- Écran, mêmes leçons qu'avant (`analyses/generations/logarithme.json`,
  `equation.json`) : plus de zoom extrême ni de contenu coupé par la caméra (la
  question du logarithme entière, `log(1000) = 3` visible, l'équation lisible du
  début à la fin). **Reste visible : superpositions de placement** (formules
  mêlées au titre, `ax + b = c` sur les étapes) → étapes 2 et 3.

### 2026-11-08 soir — Claude Code : générateur, route, lecture en flux (étapes 2 à 5)
- `server/nesalio/generator.ts` : `generateNesalio(question, config)` →
  événements `lesson` (avec `math_context`), `slice`, `error`, `end`. Lit le flux
  du modèle ligne par ligne (`LineSplitter` de l'ancien code), valide chaque
  tranche dès qu'elle est complète (contrat + capacités `PLAYABLE`), ignore les
  lignes non JSON. Tranche refusée → **une** correction : le modèle reçoit les
  lignes acceptées + `repairMessage` ; les tranches déjà acceptées qu'il réécrit
  sont ignorées. Correction ratée → on garde ce qui était valide (`end`), ou
  `error invalid` s'il n'y avait rien. `MAX_SLICES = 6`. Effort de réflexion :
  `firstTurnEffort` (`none` par défaut), comme le premier tour du tuteur.
- `app/api/nesalio/route.ts` : `POST { question }` → NDJSON, compte requis,
  limite 40 / 10 min, 503 si aucun modèle configuré.
- `domain/nesalio/engineShell.json` (ex-`fixtures/lessonShell.json`) +
  `lessonHeader()` dans `lesson.ts` : le serveur et le navigateur ajoutent
  eux-mêmes les sections du moteur.
- `engine/nesalioPlayback.ts` : `playNesalioStream(header, slices, options)`
  joue les tranches à mesure qu'elles arrivent (file d'attente `beatQueue`),
  prépare la voix du passage suivant dès que sa tranche est là, `onWaiting`
  quand la suite n'est pas encore écrite. `playNesalioLesson` l'utilise pour un
  document complet (refus des capacités inconnues avant de jouer, inchangé).
- `services/nesalio/stream.ts` : `openNesalioStream(question, signal)`.
  `/dev/nesalio` : champ « Question » + « Générer et lire », délai du premier son affiché.
- Réutilisé de l'ancien code : `LineSplitter`, `readLines`, `encodeLine`,
  `streamChatCompletion`, `ChatProvider`, `requireAccount`, `createSessionLimits`,
  `readBoundedText`, `sessionHeaders`. Rien supprimé : l'ancien parcours élève
  en dépend encore (nettoyage prévu à la bascule).
- Tests : générateur (6, faux modèle), route (2), lecture en flux (1). `tsc` OK,
  558 tests.
- **Réel**, navigateur, « Comment résoudre une équation du premier degré ? » :
  génération complète en 9,1 s, **premier son après 4,4 s** (contre 26 s pour le
  script sans flux, effort `low`), aucune correction nécessaire, aucun
  avertissement, explication jouée jusqu'au bout. Défaut visible : la caméra
  zoome très fort sur `2x + 3 = 7` puis dézoome à l'extrême à la fin (contenu
  minuscule) — même chantier caméra/placement.
- Reste : banc de 10 questions (étape 6), après le chantier tableau.

### 2026-11-08 soir — décisions de l'utilisateur sur la richesse
- Constat de l'utilisateur : la leçon générée est moins riche qu'une réponse de
  chat du même modèle (exemples, propriétés, applications).
- Cible de durée : **1 à 2 minutes** par explication, comme une vidéo courte ;
  à adapter plus tard selon ce que l'élève cherche (sujet de l'orchestrateur).
- **Enrichissement reporté.** Pistes notées : prompt moins bridé (longueur selon
  la question, consignes de contenu), mesure de l'écart avec la réponse de chat
  dans le banc, et seulement si nécessaire deux appels (contenu libre, puis mise
  en scène Nesalio ; même modèle d'abord).

### 2026-11-08 soir — Claude Code : premier essai réel du prompt (test visuel)
- Contrat : descriptions `.describe()` sur les champs à choisir (repris
  automatiquement dans le prompt, entre « »). `priority` reste accepté (les
  leçons v3.3 l'utilisent) mais n'est lu par aucune règle du moteur : masqué du
  prompt (`HIDDEN_FIELDS`). `pause_after` n'est pas exécuté par le lecteur :
  retiré du format décrit dans le prompt. **À faire : faire marcher
  `pause_after`** (silence court/moyen/long après un passage), puis le
  réintroduire dans le prompt.
- Script `app/tools/eval/generation-reelle.test.mjs` (`GENERATION_REELLE=1
  QUESTION=…`) : vrai modèle, validation tranche par tranche, leçon assemblée
  dans `analyses/generations/<sortie>.json` (+ `.brut.txt`, `.rapport.json`).
- « Explique-moi une fonction logarithme », DeepSeek V4.1 Flash, effort `low` :
  **5 tranches valides sur 5 du premier coup**, maths justes, formule en parties
  bien utilisée, gestes sur leurs mots. Jouée en entier sur `/dev/nesalio`.
- **Problèmes vus à l'écran (surtout le moteur, pas le prompt) :**
  1. Placement : les textes et formules ne traitent pas axes et courbes comme
     des obstacles (`allowOverlap` les exclut) → `log(a×b) = …` posé sur l'axe
     des x, étiquette `log(1) = 0` sur le texte. Même cause que l'étiquette
     `(1 ; 0)` vue plus tôt.
  2. Placement : chaque tranche repart de l'origine du tableau ; les axes de la
     tranche 3 tombent sur le titre de la tranche 1, les formules de la tranche
     2 se mêlent au titre. Il manque une règle « nouvelle zone libre » et une
     façon de déplacer un repère (axes + courbes + points) d'un bloc.
  3. Caméra : `camera.focus` à `beat:start` sur des objets pas encore visibles,
     sans `bounds`, ne cadre rien (render_bounds vide) → contenu coupé. Le
     contrat (`camera_policy.allow_focus_on_layout_bounds_for_unrevealed_targets`)
     prévoit de cadrer l'encombrement réservé ; `fitSceneCamera` ne l'applique pas.
  4. Délai : première tranche après **26 s** (objectif < 10 s).
  5. Mineur, prompt : quelques gestes accrochés à un mot qui ne nomme pas l'objet
     (« Retiens l'essentiel »).

### 2026-11-08 soir — Claude Code : prompt système du générateur (étape 1/6)
- Décision de l'utilisateur : le prompt sert **uniquement à générer
  l'explication** au format Nesalio. Pas de boucle pédagogique (pas de
  questions à l'élève, pas de remédiation, pas de diagnostic), contrairement à
  l'ancien `server/tutor/prompt.ts`.
- `server/nesalio/prompt.ts` : `buildNesalioSystemPrompt()`,
  `buildNesalioMessages(question)`, `repairMessage(sliceId, issues)`. Sections :
  rôle, format (une ligne JSON par élément : `{"lesson", "math_context"}` puis
  `{"slice"}` par ligne, 3 à 5 tranches), langage **généré depuis le contrat**
  (`z.toJSONSchema`, limité à `PLAYABLE`), règles de synchro (mots entiers,
  geste sur le mot qui nomme l'objet, `parts`, `start`/`end`, premier passage
  court, say écrit en mots), placement (figures en coordonnées mathématiques,
  textes jamais), maths (`log` = base 10, pas de `ln`), 3 exemples de domaines
  différents, liste de vérification. ≈ 3 300 tokens.
- `engine/nesalioPlayback.ts` exporte `PLAYABLE` : `transform` et
  `layout.reflow` (dans le contrat mais pas exécutables) ne sont pas proposés.
- Tests `server/nesalio/prompt.test.ts` : chaque exemple du prompt passe le vrai
  validateur ; chaque objet/verbe exécutable est décrit, les autres non ; aucune
  trace de boucle pédagogique ni de « Kairos ».
- Export lisible : `PROMPT_EXPORT=1 npx vitest run tools/eval/prompt-nesalio.test.mjs`
  → `analyses/prompt-nesalio.md`.
- Suite : générateur (`server/nesalio/generator.ts`), route `/api/nesalio`,
  lecteur en flux, champ question sur `/dev/nesalio`, banc de 10 questions.

### 2026-11-08 soir — Claude Code : renommage Kairos → Nesalio
- Demande de l'utilisateur : le projet s'appelle Nesalio, « Kairos » est un
  ancien nom. Renommé : `domain/kairos/` → `domain/nesalio/`,
  `nesalio_vocabulary_v3_3.json`, `engine/nesalioPlayback.ts` (+ test),
  `services/voice/nesalioClip.ts`, `ui/board/manim/NesalioProjection.ts`,
  `app/dev/nesalio/` (page `/dev/nesalio`), types `NesalioFrame`, `NesalioClip`,
  `NesalioWarning`, `playNesalioLesson`, constantes `NESALIO_FORMAT_VERSION`,
  `NESALIO_VOCABULARY`, en-tête `X-Nesalio-Cue-Timings`,
  `DEFAULTS.nesalioVoiceModel`. Le contrat exige maintenant
  `vocabulary_file: "nesalio_vocabulary_v3_3.json"` : les leçons d'origine de
  `Downloads/` (ancien nom) ne passent plus la validation telles quelles ; les
  copies de `analyses/voix-reelle-2026-11-08/` ont été mises à jour.
- Supprimé : `analyses/voix-reelle-2026-11-08/lecon-repères-a-b-c.json`
  (copie dépassée par `lecon-formule-en-parties.json`).
- Vérifié : plus aucune occurrence de « kairos » dans `app/src`, `app/tools`,
  `app/docs` ; `tsc` OK ; 543 tests ; leçon logarithme jouée en réel sur
  `/dev/nesalio` (7 passages, en-tête `X-Nesalio-Cue-Timings`, aucun
  avertissement, « Explication terminée »).
- Ce journal a été réécrit avec le nouveau nom, y compris les anciennes entrées.

### 2026-11-08 soir — Claude Code : filet de sécurité de la lecture
- `scheduler.ts` : `scheduleBeat` renvoie `{ timeline, deferred }` et ne lève
  plus d'erreur de minutage. Repère sans heure → geste reporté, ainsi que les
  `after:` qui l'attendent. Repère qui dépasse la fin du clip de moins de
  `CLIP_END_TOLERANCE_MS` (150 ms) → ramené à la fin ; au-delà → reporté. Un
  geste qui déborderait du clip est raccourci à sa fin. Les erreurs de
  structure (doublons, cycles) lèvent toujours (c'est le rôle du validateur).
- `nesalioPlayback.ts` : gestes reportés appliqués à la fin du passage
  (affichage, valeur finale du paramètre, style ; surlignage omis car
  passager). Voix en échec → un nouvel essai, puis passage sans voix (tous les
  gestes, `readingTimeMs`, option `wait` pour les tests). Audio interrompu en
  cours → tableau complété. Nouveau `onWarning(NesalioWarning)`.
- `/api/voice` : ne répond plus 502 quand un repère manque ; livre l'audio et les
  heures trouvées, journalise les manquants côté serveur.
- `nesalioClip.ts` : `readTimings` tolère un en-tête d'heures illisible.
- `/dev/nesalio` affiche les avertissements.
- Tests : ordonnanceur (report, dépendance `after:`, dépassement léger/fort,
  geste raccourci), lecteur (report, deux essais puis sans voix, second essai
  réussi, audio interrompu), route (clip livré sans heures). `tsc` OK, 543 tests.
- Navigateur, vraie voix, leçon logarithme avec pannes injectées : repère
  `point_un` retiré → `(1 ; 0)` apparaît en fin de passage ; voix du passage
  « Ensuite, deux donne… » en 503 deux fois → passage sans voix avec les trois
  points et le sous-titre ; la leçon va jusqu'à « Explication terminée ».

### 2026-11-08 soir — Claude Code : leçon « fonction logarithme » écrite comme le modèle
- Claude a joué le rôle du générateur et écrit une leçon v3.3 complète
  (`analyses/voix-reelle-2026-11-08/lecon-logarithme.json`) : 3 tranches,
  formules en parties (`2^3 = 8`, `\log_2(8) = 3`), axes + `function_graph`
  `log(x)/log(b)`, points, étiquette attachée, `animate_parameter` de la base
  2 → 10. Jouée avec la vraie voix sur `/dev/nesalio`, sans erreur.
- Ce qui marche : validation, voix (7 passages, tous les repères horodatés),
  formules partie par partie sur leur mot, points sur « deux », « quatre »,
  « huit », tracé de la courbe étalé entre deux repères, aplatissement de la
  courbe pendant « passe … aplatit », styles `secondary`.
- Bug corrigé : `function_graph`/`parametric_curve` étaient remplis (surface
  violette sous la courbe). `NesalioProjection.ts` crée maintenant la courbe avec
  `setFillOpacity(0)`, comme l'ancien `ManimRenderer`.
- Erreur d'auteur (pas du système) : l'échappement shell avait transformé
  `\log` en `log` ; la validation l'accepte car c'est du LaTeX valide (produit
  l·o·g). Le futur générateur produit du JSON directement, sans ce risque.
- Mesure précise de la synchro (état du lecteur lu à chaque pause, instrumentation
  temporaire de `/dev/nesalio` retirée ensuite) : pour `p1` (« un, zéro »),
  `p1_label` (« vaut zéro »), `p2` (« deux »), `p4` (« quatre »), `p8` (« huit »),
  l'objet est absent 10 à 40 ms avant le début du mot et présent 40 ms après.
  Cas limite : absent à 1822 ms pour un repère à 1823 ms. Synchro exacte.
- Observé, non corrigé :
  1. l'étiquette `(1 ; 0)` attachée à droite du point chevauche l'axe des x
     (le placement d'un attachement n'évite pas les axes, `allowOverlap`) ;
  2. quand la caméra cadre axes + formules, le texte devient petit
     (`camera_policy.keep_text_readable` n'est pas appliqué) ;
  3. les points de base 2 restent affichés quand la base passe à 10 (choix de
     design de la leçon ; ils ne suivent pas le paramètre).

### 2026-11-08 après-midi — Claude Code : formules écrites par parties (option B)
- Problème vu par l'utilisateur : `9 + 16 = 25` s'écrivait d'un bloc sur
  « vingt-cinq », après « neuf plus seize ». Cause : design (aucun repère sur
  « neuf », « seize ») **et** limite du contrat (`write` visait un objet entier).
- Décision (utilisateur) : la solution la plus pérenne, une formule reste un seul
  objet avec des **parties nommées**, `write` peut viser une partie. Inspirée de
  Manim (`MathTex` en plusieurs chaînes) ; repères vocaux façon `manim-voiceover`.
- Contrat (`contract.ts`) : `math.parts` facultatif (2 à 16 `{id, text}`, ordre de
  lecture) ; `write.part` facultatif ; `RuntimeState.objects[].visible_parts`
  tant qu'une formule est partiellement écrite.
- Validation (`validate.ts`) refuse : parties qui, bout à bout (sans espaces), ne
  redonnent pas `content` ; partie qui n'est pas du LaTeX autonome (accolades,
  `\left/\right`, `\begin/\end`, exposant séparé de sa base, commande sans ses
  arguments comme `\frac{1}`) ; parties sur un contenu `computed` ; `part`
  absente ou sur une formule non découpée ; même partie écrite deux fois.
  `ValidationState` a un nouveau champ `parts`.
- État de scène (`sceneState.ts`) : `PlacedObject.revealedParts`, `revealPart()`,
  `partVisible()` ; `setVisibility` rend l'objet entier.
- Lecteur (`nesalioPlayback.ts`) : `NesalioFrame.partReveals` (formule → partie →
  progression).
- Rendu (`NesalioProjection.ts`, `primitives.ts` → `boardFormulaParts`) : une seule
  mise en page MathJax ; `manim-web` répartit les glyphes entre les parties ; les
  parties non écrites ont `opacity = 0` mais gardent leur place.
- Vocabulaire v3.3 : descriptions de `math` et `write` mises à jour.
- Tests : `domain/nesalio/mathParts.test.ts` (addition, équation, polynôme,
  fractions ; chaque refus ; état renvoyé au modèle), `engine/nesalioPlayback.test.ts`
  (premier test du lecteur Nesalio), fixture neutre
  `domain/nesalio/fixtures/lessonShell.json` (réglages moteur v3.3 sans contenu).
  `tsc` OK, 536 tests passent.
- Navigateur, vraie voix, `analyses/voix-reelle-2026-11-08/lecon-formule-en-parties.json` :
  pause avant « neuf » → rien ; après « neuf » → `9` ; après « seize » →
  `9 + 16` ; après « vingt-cinq » → `9 + 16 = 25`, en une ligne. Leçon finie sans erreur.
- Pas fait : surligner ou transformer une partie ; écrire toute la formule après
  certaines parties affiche le reste d'un coup (sans animation).

### 2026-11-08 après-midi — Claude Code : repères en mots entiers
- Problème vu par l'utilisateur : dans le premier passage de la leçon, les
  étiquettes `a` et `b` apparaissaient ensemble. Cause : **le JSON** accrochait
  les deux à `cue:sides` (« côtés »). Le code faisait ce qui était demandé.
- Défaut de code trouvé au passage : `cueOffset` (`domain/nesalio/alignment.ts`)
  cherchait le texte du repère n'importe où, même dans un mot (« a » tombait
  dans « tri**a**ngle »). Corrigé : un repère ne correspond qu'à des **mots
  entiers** ; `occurrence` compte des mots entiers. Un caractère prolonge le
  mot s'il est lettre, chiffre ou accent (`\p{L}\p{N}\p{M}`, donc `²`), trait
  d'union collé à une lettre (« vingt-cinq »), virgule ou point entre deux
  chiffres (« 3,14 »). L'apostrophe (droite ou courbe) est une frontière.
  Utilisé à la fois par la validation et l'alignement, qui restent d'accord.
- Validation : message « un repère doit désigner des mots entiers ».
- Tests : nouveau `domain/nesalio/alignment.test.ts` (cueOffset et
  alignBeatCues), cas de validation dans `contract.test.ts`, phrase du
  triangle ajoutée au banc réel (vérifie l'ordre côtés < a < b < c).
  `tsc` OK, 528 tests passent, banc réel 16/16.
- Navigateur, leçon corrigée (`analyses/voix-reelle-2026-11-08/lecon-repères-a-b-c.json`,
  repères `a`, `b`, `c` ajoutés) : audio mis en pause entre chaque repère ;
  rien pendant « côtés », puis `a` seul, puis `a`+`b`, puis `a`+`b`+`c`.
- Reste côté design : le futur prompt du générateur doit dire qu'un geste se
  déclenche sur le mot qui nomme l'objet, pas sur un mot général avant lui.

### 2026-11-08 après-midi — Claude Code : test réel de la voix Nesalio
- Banc réel `app/tools/eval/voix-reelle.test.mjs` : 15 phrases françaises
  difficiles (apostrophes droite et courbe, nombres, `π`, `x²`, `−2`, `50 %`,
  sigles, mots répétés, lettre seule) envoyées pour de vrai à ElevenLabs Flash
  2.5 via le Gateway, avec le vrai code (`synthesizeSpeech`, `alignBeatCues`).
  Résultat : 15/15 horodatages reçus, texte renvoyé identique à `say` 15/15,
  aucun caractère de durée nulle, 27/27 repères avec une heure.
- Navigateur, `/dev/nesalio`, leçon `kairos_scene_v3_3.json (fichier d’origine, ancien nom)` (seule leçon
  existante) : `/api/voice` réel → 200, MP3 et `X-Nesalio-Cue-Timings`. Les
  5 passages jouent de bout en bout, sans erreur ; aucun repère ne dépasse la
  durée du clip mesurée par le navigateur. Le lecteur échantillonne
  `audio.currentTime` à chaque image : le geste part à l'heure du repère à une
  image près.
- Conclusion : les cas « repère manquant » n'apparaissent pas en réel ; le
  filet de sécurité devient une précaution, pas une urgence.

### 2026-11-08 — Claude Code
- Repris la session Codex arrêtée (limite d'usage) après le branchement
  ElevenLabs. `tsc --noEmit` OK, `vitest run` : 519 tests passent.
- Relu ordonnanceur, audio et moteur mathématique ; points ouverts ci-dessus.
- Mis en place la règle de documentation (`AGENTS.md`, `CLAUDE.md`, ce fichier).

### 2026-11-08 matin — Codex
- Passage à ElevenLabs Flash 2.5 avec horodatage par caractère
  (`server/ai/audio.ts`, `app/api/voice/route.ts`, `domain/nesalio/alignment.ts`,
  `server/config.ts`). Essai réel sur une phrase courte : le Gateway renvoie bien
  les heures. Tests et contrôle navigateur non terminés (limite d'usage).
- Branchement du lecteur Nesalio sur Manim (`nesalioPlayback.ts`, `nesalioClip.ts`,
  page `/dev/nesalio`).

### 2026-11-07 soir — Codex
- Décision de repartir de zéro (fil ChatGPT « Continuer la conversation »).
- Contrat v3.3, validation, état de scène, placement, ordonnanceur.
