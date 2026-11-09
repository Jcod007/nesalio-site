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

Nouveau système voix et tableau dans `app/src/domain/nesalio/`. Depuis
`4c8e447`, la page élève le choisit par défaut quand l’IA est configurée.
L’ancien tuteur reste accessible selon le réglage, le mode sans IA et
l’inspection locale. Les travaux postérieurs à ce commit sont dans l’arbre de travail.

| Module | État |
| --- | --- |
| Contrat JSON + validation (`contract.ts`, `validate.ts`) | Fait, testé |
| État de scène + placement (`sceneState.ts`, `placement.ts`) | Fait, testé |
| Moteur mathématique (`compileNamedExpression` dans `src/domain/math/expr.ts`) | Partiel : ajouté à l'ancien `expr.ts`, pas réécrit de A à Z, un seul test |
| Ordonnanceur (`scheduler.ts`) | Fait, 3 tests |
| Audio (`alignment.ts`, `/api/voice`, `services/voice/nesalioClip.ts`) | Fait, testé en réel le 2026-11-08 (voir journal) |
| Lecteur Nesalio + Manim (`engine/nesalioPlayback.ts`, `ui/board/manim/NesalioProjection.ts`) | Intégré au parcours élève et à la page de test `/dev/nesalio` |
| Générateur de tranches + prompt (`server/nesalio/`, route `/api/nesalio`) | Fait, joué en réel en flux (premier son ≈ 3 à 7 s) |
| Tableau : dim / fade_out / remove, transform, move, to_edge / to_corner | Fait, vu en vraie génération (2026-11-08) |
| Caméra | En cours : suivi automatique et objets gardés faits ; **reste détaillé dans [`app/docs/chantier-camera.md`](app/docs/chantier-camera.md)** (fiche de passation pour une autre IA) |
| Orchestrateur de séance (interruptions) | Pas commencé |
| Bascule du parcours élève sur Nesalio | Bascule par défaut dans le dépôt. Retrait de l’ancien tuteur à décider après vérification de la parité. |

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

### 2026-11-09 — Bilan avant changement de conversation (Claude Code)
**Mesure après les corrections de justesse** (contrôles `valueChecks.ts`, consignes, fiches, FACTS ; consignes
allégées), 54 questions Alloprof × 2 (`analyses/banc/ap2-allegees/`) : 101/108 intactes (93,5 %), 1re tranche
médiane 3,1 s. Notation à l'aveugle avant/après (1er tirage, 3 correcteurs, `notation-justesse/` des notes) :
**63,2 contre 59,1** ; maths 59,5 / 57,0 ; chimie 65,8 / 60,7 ; après meilleur sur 30 questions, avant sur 19,
5 égalités ; leçons < 50 : 17 contre 19. Gain réel mais modeste : environ une leçon sur trois garde une erreur grave.
Défaut de la notation : la réponse de référence s'affichait « [object Object] » (script de dossiers à l'aveugle,
champ `reponse.texte`), aussi dans `notation-alloprof/` ; les correcteurs ont refait chaque calcul.

**Où on en est** :
- Rien n'est commité depuis `4c8e447` (deux jours de travail dans l'arbre de travail).
- Défaut de l'app : consignes complètes ; la version allégée (`NESALIO_CONSIGNES=allegees`) fait mieux partout
  mesuré, pas encore passée par défaut (décision utilisateur).
- Le levier le plus fort mesuré : un relecteur (Sonnet 5.5 : 27/29 erreurs graves trouvées hors ligne, 2,5 s,
  0,007 $/leçon ; DeepSeek « low » 26/29). Pas branché ; à mesurer : la boucle de correction et le délai.

**Décisions en attente de l'utilisateur** :
1. Brancher le relecteur (version hybride : DeepSeek écrit, Sonnet relit tranche par tranche) et le mesurer.
2. Passer la version allégée des consignes par défaut.
3. Évaluer deux bibliothèques (accepté en principe, à faire ici ou après commit) : `@cortex-js/compute-engine`
   (résoudre systèmes/équations pour les contrôles) et `manim-web` 0.41.0 (0.40.1 corrige la duplication de
   glyphes de `MathTex.copy()`, piste des « lettres fantômes » du transform ; molécules = nouveau type JSON).
4. Défauts visuels du juge visuel cycle 2 (transform, police des tableaux avant chargement, dérivée hors repère,
   accents dans `\text{}`, tableau d'atomes non mis à jour, voix bloquée une fois) : numéros à choisir.
5. Limite de 24 caractères par case ; objet redéclaré à l'identique vu en double ; `math_context` par tranche
   et cases calculées (changent le JSON) ; Q3, Q9, Q10.
- Clé AI Gateway d'essai `nesalio-local-7j-2026-11-09` : plafond relevé à 5 $ par l'utilisateur, expire le 16 novembre.

### 2026-11-09 — Relecture justesse des lots dev 1 et dev 2 (relecteur, Claude Code)

Rien commité. Rapport : `side-session-notes/…/relecteur-justesse.md`.
- **Contrôles (dev 1)** : rejeu sur TOUT `analyses/banc/` (572 leçons, copie temporaire de `controles-banc`) : 22 refus,
  tous de vraies erreurs, identiques avant/après mes corrections. Sondes de cas limites : 4 faux refus trouvés et corrigés
  (`valueChecks.ts`, `coherence.ts`, + 4 tests dans `valueChecks.test.ts`) : inéquation en x seul résolue dans la tranche
  prise pour une contrainte ; rappel partiel des contraintes ; « max »/« sommet » hors d'une DROITE ; table « [H⁺] relative »
  ou en mmol/L. Message pH : « 1 × 10⁻⁷ » au lieu de « 1e−7 ».
- **Fiches/FACTS (dev 2)** : faits relus un à un, calculs refaits. Corrigés : Mg(OH)₂ appelé « sel » (c'est une base) ;
  mot « chaux » (chaux vive = CaO) ; « éthanol » déclenché par « méthanol » ; « fusion/fondre » par « confusion/confondre » ;
  craie → « craie naturelle » ; r ≈ ±(1 − l/L) : signe écrit dans le calcul (sinon `named_value` refusait r ≈ −0,75).
- **Prompt** : phrases 1, 2, 4 de dev 1 fusionnées dans MATH_RULES (deux versions) ; 5 et 3 dans les fiches
  `programmation_lineaire` et `chimie_acides`. Retirés pour la place : fin de « Vérifie chaque calcul… » et l'exemple
  d'axes. Coquille « répond » → « réponds ». Complet 36 994, allégé 36 577 ; empreinte mise à jour.
- **Vérifié** : `npx vitest run` 881 verts ; `npx tsc --noEmit` vert. L'erreur tsc de `controller.test.ts` signalée par
  dev 2 ne se reproduit pas (fichier inchangé depuis 5c24048) : état transitoire pendant le travail de dev 1.
- **Prochaine étape** : relancer le banc Alloprof (complet + allégé) pour mesurer l'effet réel des messages et du prompt.

### 2026-11-09 — Essai du relecteur terminé (chercheur, Claude Code)
- Limite de la clé relevée à 5 $ par l'utilisateur. 90 leçons relues avec les deux réglages, 0,89 $ au total.
- DeepSeek V4.1 Flash réflexion « low » : 26/29 leçons graves trouvées, 63/69 alertes justes, 2 vraies fausses
  alertes sur 61, 9,4 s médian, 0,0032 $/leçon. Claude Sonnet 5.5 (sans réflexion) : 27/29, 78/88, 2/61, 2,5 s
  médian, 0,0067 $/leçon, 4 réponses hors format. Ensemble : 28/29.
- Recommandation du chercheur (non décidée) : DeepSeek écrit, Sonnet relit tranche par tranche ; garde-fous :
  citation retrouvée mot pour mot, `math_context` retiré du texte relu. À mesurer : boucle de correction, stabilité.

### 2026-11-09 — Contrôles par le code des tableaux, figures et valeurs (dev 1, Claude Code)
- Choix « 1 » de l'utilisateur (analyste-erreurs-graves P2, P3, P5, P1 côté code). Rapport :
  `side-session-notes/…/dev1-controles.md`.
- Nouveau `domain/nesalio/valueChecks.ts` + `coherence.ts` : 7 règles refusées avec la bonne valeur — tableau d'atomes
  ↔ équation (`atom_table`), table de valeurs ↔ règle (`value_table`), pH ↔ [H⁺] (`ph_table`), point nommé
  sommet/creux/zéro hors courbe (`named_point`, noté si plusieurs courbes), polygone ↔ inégalités (`constraint_polygon`),
  inégalité numérique fausse (`false_inequality`), valeur arrondie ≠ calcul de la formule précédente (`named_value`).
  `chemistry.ts` lit les équations en plusieurs `\ce{}`. `expr.ts` : crochets lus en parenthèses ET partie entière
  (faux refus de zeros-A corrigé), `readLatexFunction`, floor/ceil acceptés dans les expressions (le prompt les annonce ;
  `contract.test.ts` mis à jour). Structure du JSON inchangée.
- Vérifié : `npx vitest run` et `npx tsc --noEmit` verts. Rejeu de tout le banc (`tools/eval/controles-banc.test.mjs`,
  `CONTROLES=1`) : 9 des 29 leçons graves attrapées, 0 faux positif sur les 61 leçons notées sans erreur grave,
  6 refus sur des leçons non notées, tous de vraies erreurs ; corpus `analyses/generations` inchangé.
- Non vérifié : effet en génération réelle (le modèle répare-t-il la tranche ?). Prochaine étape : banc Alloprof
  avec ces contrôles et les consignes de dev 2.

### 2026-11-09 — Consignes de justesse, fiches par notion, lexique de faits (dev 2, Claude Code)
- Choix « 2 » de l'utilisateur (analyste-erreurs-graves P1 consignes, P4, P5 côté prompt). Rapport complet :
  `side-session-notes/…/dev2-consignes-fiches.md` (textes exacts, faits et sources).
- `pedagogy.ts` : TEACHING reçoit 4 consignes (reformuler les données de l'élève et répondre à SON cas ; corriger ce
  qu'il affirme de faux ; calcul et résultat dans la même formule ; vérification écrite par substitution) → présentes
  dans les DEUX versions du prompt. Fiches corrigées : rectangle de corrélation (L, l définis, tous les points),
  eau de Javel (toute solution d'ions conduit). Fiches complétées : gaz (lois simples, Dalton, plusieurs changements),
  acides (polyprotiques, titrage, reconnaître acide/base/sel, pH ↔ [H⁺]), énergie (changements d'état, physique/chimique/
  nucléaire, complexe activé), Kps (comparaison), structure (double liaison, CO₂), stœchio (limitant). Nouvelles fiches :
  `programmation_lineaire`, `vote_majorite`, `graphes`, `coniques`. Mots déclencheurs corrigés (« fonctionne »,
  « completer », « volume » d'un gaz, « Stoechio », « endo/exo »…). Nouveau `FACTS` + `factsFor` : lexique injecté
  quand son mot est dans la question (substances, polyacides, signe de ΔH des changements d'état), hors limite de 2 guides.
- `prompt.ts` : floor et ceil annoncés (P5). Pour rester < 37 000 car., 7 règles de forme couvertes par le code quittent
  aussi la version complète (liste dans le rapport). Complet 36 914 car., allégé 36 497. Empreinte de
  `prompt-consignes.test.ts` mise à jour volontairement.
- Vérifié : `npx vitest run src/server/nesalio/` vert ; tests de sélection sur 23 vraies questions Alloprof.
  Suite complète : 1 échec hors de mon périmètre (`contract.test.ts` l. 202 attend que `floor` soit refusé, or
  `expr.ts` de l'autre dev l'accepte maintenant) ; `tsc` : 1 erreur dans `domain/tutor/controller.test.ts` (pas touché).
- Non vérifié : effet réel sur les générations (à mesurer au banc Alloprof) ; relecture des fiches par un enseignant.
- Prochaine étape : relancer le banc Alloprof (complète et allégée) et noter à l'aveugle.

### 2026-11-09 — Essai hors ligne d'un relecteur (chercheur, Claude Code)
- Choix de l'utilisateur « 1, 2 et 3 » (contrôles du code, consignes + fiches, essai du relecteur). Rapport :
  `chercheur-relecteur.md` (notes partagées) ; script `analyses/relecture/relire.mjs` (reprend où il s'arrête).
- Arrêté par le plafond de 1,00 $ de la clé AI Gateway (402) : 50 leçons sur 90 relues avec DeepSeek réflexion
  « low », 4 avec `anthropic/claude-sonnet-5.5`. DeepSeek low : rappel 13/15 erreurs graves, précision 33/37,
  1 fausse alerte sur 35 leçons sans erreur grave ; 11 s médian par leçon entière, 0,003 $. Sonnet : trop peu
  relu pour conclure. Reste ≈ 0,8 $ pour finir : l'utilisateur doit relever la limite de la clé.

### 2026-11-09 — Essai sur de vraies questions Alloprof (Claude Code)
- Demande de l'utilisateur : refaire l'essai « consignes allégées » sur de vraies questions de la Zone d'entraide
  Alloprof (125 607 questions), maths + chimie sec 4-5, avec plus de chimie, dont les gaz. Corpus de 54 questions
  (`app/tools/eval/questions-alloprof.mjs` → `corpus-alloprof.json`, texte seul, aucun nom ; usage interne) ;
  le banc lit un autre corpus avec `CORPUS=…`.
- Crédit Vercel épuisé en cours de mesure (402 `insufficient_funds`) : l'utilisateur a rechargé ; leçons relancées
  (`analyses/banc/ap-*-reprise`).
- Leçons intactes (45 questions × 2) : complète 82/90 (91 %), allégée 84/90 (93 %). Gaz (9 questions × 2) : complète
  12/13, allégée 13/13 hors 5 + 5 pannes du fournisseur (« aucun octet reçu pendant 45 s » puis « fetch failed »).
- Notation à l'aveugle (45 questions, 1er tirage, 3 correcteurs ; notes dans `notation-alloprof/` des notes
  partagées) : allégée 63,7/100 contre complète 59,9 ; maths 59,0 / 55,8 ; chimie 68,2 / 63,8 ; < 50 : 14 contre 16.
  Les gaz ne sont pas encore notés.
- Constat principal : sur de vraies questions, Nesa perd ~15 points (≈ 62 contre 75-80 sur notre corpus), une leçon
  sur trois a une erreur grave : résultat faux, tableau ou figure qui contredit les nombres, affirmation fausse.
  Prochaine étape à décider : s'attaquer à la justesse.

### 2026-11-09 — Évaluation de la voix et du rendu (en cours)
- Accord de l’utilisateur pour rejouer les 18 premiers tirages du banc fond-forme sur ordinateur. 216 passages, 26 044 caractères, voix Eleven Flash v2.5. Avant essai, Vercel indique 0,34055 $ US consommé sur le plafond de 1 $. Prix publié de la synthèse seule : environ 0,52 $ US pour un passage complet du corpus, hors reprises.
- Copie locale isolée de `/dev/nesalio` instrumentée pour associer les repères renvoyés par la voix aux images calculées par le moteur. Capture pilote en cours. Prochaine étape : vérifier la capture et lancer les 18 relectures avec les mêmes réglages.

### 2026-11-09 — Essai « moins de consignes » (Claude Code)
- Question de l'utilisateur : plus il y a de règles, moins le modèle les respecte ? Essai accepté (« Oui, essaie »).
- Version allégée (`NESALIO_CONSIGNES=allegees`, `prompt.ts`) : 15 règles de forme retirées, chacune couverte par
  le code ; 36 984 → 35 618 caractères. Défaut inchangé (empreinte vérifiée par `prompt-consignes.test.ts`).
- Banc 32 × 2 (`analyses/banc/c3-allegees/`) : 63/64 intactes (complète : 62/64) ; 1re tranche médiane 3,9 s
  (4,5 s), max 13,8 s (23,7 s) ; 30 refus (34).
- Notation à l'aveugle (1er tirage, 2 correcteurs, un par moitié ; notes dans `notation-consignes/` des notes
  partagées, clé dans le dossier temporaire de la session) : **allégée 80,2/100 contre complète 74,5** ; maths
  80,3 / 73,4 ; chimie 80,0 / 77,0 ; allégée meilleure sur 17 questions, complète sur 11, 4 égalités ; < 50 :
  complète 3 (correlation-sens 30, derivee 49, programmation-lineaire 24 coupée), allégée 1 (calorimetrie 38 coupée).
- Limite : un seul tirage noté et un correcteur par question : écart encourageant, pas une preuve. Non décidé :
  passer la version allégée par défaut.

### 2026-11-09 — Consignes allégées du prompt système (dev-consignes, Claude Code)
- `app/src/server/nesalio/prompt.ts` : `NESALIO_CONSIGNES=allegees` (ou `buildNesalioSystemPrompt("allegees")`) retire 15 passages de pure forme de FORMAT, SYNC_RULES, LAYOUT_RULES, MATH_RULES et CHECKLIST (liste `LIGHT_REMOVALS`). Sans la variable : prompt complet inchangé (36 984 car.) ; allégé : 35 618 car. TEACHING, langage généré, exemples, règles de fond et de jugement gardés. Guides par notion inchangés.
- Chaque passage retiré est couvert par une réparation (`normalize.ts`) ou un refus précis (`validate.ts`, `contract.ts`) ; détail et fichier:ligne dans le rapport de session `consignes-allegees.md`. Les refus de `contract.ts` sont des messages zod en anglais (précis, avec chemin).
- Test `prompt-consignes.test.ts` : empreinte SHA-256 du prompt complet (à mettre à jour si on modifie volontairement le prompt complet), retraits et passages gardés. `.env.example` documente la variable. `npx vitest run` et `npx tsc --noEmit` verts. Le banc (`banc-nesalio.test.mjs`) lit la variable : le générateur appelle `buildNesalioMessages` dans le même processus.
- Non vérifié : effet réel sur les générations (à mesurer au banc, `SORTIE` distinct par variante).

### 2026-11-09 — Expérience fond et forme terminée
- À la demande de l’utilisateur, `app/tools/eval/fond-forme.test.mjs` compare le prompt complet, les consignes allégées et deux appels séparés sur les mêmes six questions nouvelles. DeepSeek est commun aux trois variantes et le validateur de production est réutilisé. Le metteur en forme reçoit le script sans le rôle pédagogique ni le guide de la notion.
- Banc réel terminé avec la clé plafonnée et la non-conservation active : 36 essais, 69 appels, 76 tests ciblés verts. Résultats et protocole dans `app/docs/experience-fond-forme-2026-11-09.md`, sorties et notation sous `analyses/banc/fond-forme-2026-11-09/`.
- Complet / allégé / deux appels : fond 32 / 34 / 34 sur 36, leçons intactes 12 / 12 / 11, première tranche médiane 4,0 / 3,9 / 12,4 s. En deux appels, le script de la tangente était juste mais la mise en forme a perdu la réponse. Aucun changement du générateur de production.
- Prochaine mesure proposée : élargir A contre B, puis tester le metteur en forme sur des scripts de référence vérifiés si la piste en deux appels est reprise.

### 2026-11-09 — Cycle 2 : nouvelle mesure après les lots 1 et 2 (Claude Code)
- Choix de l'utilisateur : « Fait le 1 » = lots 1 (réparations sans appel) et 2 (correction informée) de
  l'analyste. Limite de 24 caractères par case : décision toujours en attente (rien tronqué).
- Banc DeepSeek 32 × 2 (`analyses/banc/c3-deepseek/`) : **62/64 intactes (96,9 %)**, contre 57/64 avant ;
  chimie 20/20, maths 42/44 ; 1re tranche médiane 4,5 s (avant 6,1 s), max 23,7 s (avant 42,1 s) ;
  62 réparations sans appel, 34 refus. Critère automatique Q7 (≥ 95 %) atteint.
- Échecs restants : programmation-lineaire#1 et vecteurs#2 (`incomplete`, budget de corrections épuisé).
- Non fait : nouvelle notation à l'aveugle, essai visuel des lots 1-2. Point du relecteur à décider : objet
  redéclaré à l'identique alors que l'ancien est au tableau → renommé, vu en double.
- Juge visuel cycle 2 (`juge-visuel-cycle2.md` dans les notes) : 4,1/10 ; défauts : traces du transform,
  police des tableaux avant chargement, figures de la dérivée hors du repère, accents dans `\text{}`
  (trigo), tableau d'atomes non mis à jour, voix bloquée une fois. Corrections : en attente du choix de
  l'utilisateur.

### 2026-11-09 — Cycle 2, relecture des lots 1 et 2 (relecteur, Claude Code)
- Corrigé `generator.ts` : délai du **premier octet** séparé (`FIRST_BYTE_TIMEOUT_MS = 45 000`, option
  `firstByteTimeoutMs`) ; le silence de 20 s ne vaut qu'après le premier texte. Raison : au banc DeepSeek (64 leçons
  saines), en-tête reçu jusqu'à 24,9 s, 4 leçons > 20 s : elles auraient été coupées puis relancées. Test ajouté.
- Corrigé `normalize.ts` (renommage d'un id redéclaré) : un dim/fade_out/remove/move à `beat:start` du passage où le
  nouvel objet apparaît (ou d'avant) vise l'ancien, même écrit après le write dans `do`. Avant : accepté et appliqué
  au nouvel objet (il disparaissait avant d'apparaître, l'ancien restait). Test ajouté dans `normalize.test.ts`.
- Vérifié : vitest 847 OK / 7 ignorés, tsc 0 erreur, prompt système 36 984 caractères (marge 16), case ≤ 24 intacte,
  LaTeX/`\ce{}` intacts après passe guillemets + jsonrepair, pas de doublon possible au son/tableau après nouvelle
  tentative (tranches acceptées sautées). Non vérifié : banc réel.
- Point ouvert (non corrigé) : redéclaration à l'identique d'un objet encore au tableau → renommé, donc 2 copies.
- Rapport : `relecteur-lots12.md` (notes de session).

### 2026-11-09 — Cycle 2, lot 2 (dev 2) : générateur — correction informée, nouvelle tentative, JSON, flux muet
- `server/nesalio/generator.ts` : (1) au tour de correction, la ligne refusée (forme normalisée ; brute si
  illisible) est ajoutée en fin du message `assistant` ; chaque refus cite « (valeur reçue : …) », 80 caractères
  max, lue au chemin de l'erreur dans la tranche. (2) Appel en échec **avant tout octet** → 1 seule nouvelle
  tentative par leçon (pas pour un 4xx autre que 408/429). (3) `parseLine` : en dernier recours, guillemets droits
  d'une phrase échappés (passe maison : `jsonrepair` échoue sur `"mot" :` et `"mot", suite`), puis `jsonrepair`,
  seulement sur une ligne finie par `}`/`]` (sinon une ligne coupée serait complétée à moitié). Si le contrat refuse
  la version de `jsonrepair`, la ligne est renvoyée comme **illisible**, telle qu'écrite. (4) 20 s sans octet
  (`IDLE_TIMEOUT_MS`, réglable par `idleTimeoutMs`) → appel coupé ; sans aucun octet = nouvelle tentative, sinon
  reprise comptée dans le budget (`MAX_REPAIRS`, et `MAX_ATTEMPTS` sous l'id « flux interrompu »).
- `server/nesalio/prompt.ts` : `repairMessage(…, lineShown)` dit « Ta ligne refusée est ci-dessus : recopie-la en
  ne changeant que les champs cités ». Prompt système inchangé.
- Dépendance : `jsonrepair` **3.15.0** exacte (ISC, josdejong, aucune dépendance, publiée le 2026-07-03).
- Vérifié : `generator.test.ts` (fetch failed puis succès ; 4 formes illisibles du banc + guillemets ; ligne
  refusée dans le 2e message ; flux muet coupé à 20-50 ms) ; `vitest run` 846 passés, 0 échec ; `tsc` sans erreur.
  Pas vérifié : vrai appel, banc. Pas fait : nouvelle tentative et délai pour l'appel « enseignant » (`twoStage`).
- Prochaine étape : relancer le banc DeepSeek, mesurer la part de tranches acceptées au 1er essai de correction.

### 2026-11-09 — Cycle 2, lot 1 (dev 1) : réparations sûres sans appel
- `domain/nesalio/normalize.ts` : clé `after` → `at: "after:X"` ; `target_id` → `target` ;
  `start` (ou `end` seul) en `after:X` → `at` ; tableau : champ `null` de `params` retiré,
  `column_labels` tous vides retirés, en-tête vide du coin retiré (colonnes + 1 en-têtes avec
  `row_labels`) ; `write` d'un tableau sans `part` ; `parts` d'une valeur calculée retirées ;
  id redéclaré d'une tranche précédente renommé (`eq2` → `eq2_2` ou suivant libre) avec ses
  références, sauf `transform.source` et dim/fade_out/remove/move avant son apparition (ordre
  du document) ; `camera.restore` d'un cadrage jamais sauvegardé retiré (sauf si une action
  l'attend) ; `layout` vers une formule remplacée par transform → la formule actuelle.
  `domain/math/expr.ts` : `pi` accepté par `compileNamedExpression` (un symbole `pi` déclaré garde la priorité).
- Contexte des tranches précédentes : déjà passé par `generator.ts` (`normalizeSlice(value.slice, state)`) : rien à changer côté générateur.
- Non réparé (doute) : `end: after:X` avec un `start` sur un repère ; en-tête vide ailleurs qu'en 1re position ; cases > 24 caractères (limite inchangée).
- Vérifié : 11 tests dans `normalize.test.ts` (messages du banc), 1 dans `expr.test.ts` ; `vitest run` 832 OK ; `tsc --noEmit` OK. Pas de banc relancé.
- Rapport : `side-session-notes/.../dev1-lot1.md`. Prochaine étape : relecture, puis banc DeepSeek avec les lots 1-2.

### 2026-11-09 — Notation à l'aveugle : ancien tuteur, Nesalio × 3 modèles (32 questions)
- Deux correcteurs (16 questions chacun, grille `app/docs/grille-explication-nesalio.md`, premier tirage de chaque
  modèle, premier tour de l'ancien tuteur ; `notation-modeles/notation-lot-a.md`, `notation-lot-b.md` dans le dossier
  de notes ; clé de l'ordre dans le bloc-notes de la session).
- Moyennes /100 : **ancien tuteur 76,4 ; Nesalio DeepSeek 76,4** ; Nesalio GPT-6 Luna 76,1 ; Nesalio Claude Haiku 68,9.
  Maths : ancien 81,4, DeepSeek 79,0, Luna 75,9, Haiku 70,5. Chimie : Luna 76,4, DeepSeek 70,7, ancien 65,6,
  Haiku 65,5. Leçons sous 50 : 4 ou 5 pour chacun (souvent des leçons non reçues, notées 0). Premières places :
  Luna 13, DeepSeek 9, ancien 8, Haiku 2.
- Lecture : Nesalio (DeepSeek) **rejoint l'ancien tuteur** (contre 54,5 / 62,6 avant les corrections) et le dépasse
  en chimie ; Haiku, le plus fiable et le moins cher, explique moins bien ; Luna explique bien mais échoue le plus
  souvent (78 % de leçons intactes). Critères Q7 non atteints : leçons intactes < 95 %, leçons < 50/100 présentes.
  Un tirage et un correcteur par question : indicatif.

### 2026-11-09 — Banc des 3 modèles (fiabilité, délais, coût)
- 32 questions × 2 tirages, protection des données active (`analyses/banc/m-*/rapport.md`) :
  DeepSeek V4.1 Flash 57/64 intactes (89 %), 1re tranche 6,1 s, 0,54 $ ; **Claude Haiku 5.5 59/64 (92 %), 5,3 s,
  0,14 $** ; GPT-6 Luna 50/64 (78 %), 6,9 s, 0,23 $. Seuil Q7 (95 %) non atteint par aucun. Haiku : 51/60 réponses
  écrites au tableau, DeepSeek 56/63.
- Délais plus longs qu'avant la protection (2 à 3 s auparavant) ; maximums à 42-130 s à examiner.
- En cours : premier tour de l'ancien tuteur sur les mêmes 32 questions (`analyses/generations/ancien-*`) pour la
  notation à l'aveugle de la qualité. L'utilisateur voit parfois mes messages en anglais : aucun réglage de l'app ne
  traduit ; cause externe à chercher.

### 2026-11-09 — Clé rafraîchie ; protection des données vérifiée ; mesure des 3 modèles lancée
- L'utilisateur a rafraîchi `app/.env.local` (11:22, avec `AI_GATEWAY_API_KEY`).
- Vrai appel avec la non-conservation (`analyses/generations/essai-zdr.*`) : **accepté par le compte Vercel**, leçon
  complète (5 tranches). Première tranche après 7,7 s (contre 2 à 3 s auparavant) : à mesurer sur le banc.
- Lancés en parallèle : banc de 31+ questions × 2 tirages pour `deepseek/deepseek-v4.1-flash`,
  `anthropic/claude-haiku-5.5`, `openai/gpt-6-luna` → `analyses/banc/m-deepseek`, `m-haiku`, `m-luna`.

### 2026-11-09 — Code terminé et vérifié ; reste la mesure réelle
- dev-exploitation (section 8) : plus aucun repli du micro vers la reconnaissance du navigateur (Google, Apple,
  Microsoft) ; échec de transcription → 502 « Micro indisponible pour le moment : écris ta question. » ; la démo locale
  sans IA n'a donc plus de micro ; `/api/status` essaie vraiment la transcription. `speechListener.ts` n'est plus
  utilisé (gardé).
- Vérifié par Claude Code : `tsc` sans erreur ; **820 tests passés, 0 échec**, 7 ignorés. Tous les lots relus et
  acceptés. Rien commité depuis `4c8e447`, rien déployé.
- Reste : rafraîchir `VERCEL_OIDC_TOKEN` (utilisateur), puis vrai appel avec la non-conservation, banc de 31+
  questions (DeepSeek, Haiku 5.5, GPT-6 Luna), juge visuel, verdict selon Q7, essai des transcriptions protégées.

### 2026-11-09 — Clé AI Gateway pour une semaine d’essais
- À la demande de l’utilisateur, clé d’équipe `nesalio-local-7j-2026-11-09` créée dans Jcod et installée sous `AI_GATEWAY_API_KEY` dans `app/.env.local`. Vercel confirme l’expiration le 16 novembre à 11 h 22 (Toronto).
- Plafond de 1 $ US au total, sans renouvellement, choisi pour limiter les premiers essais après le rejet de la clé sans plafond. La configuration locale conserve `DISABLE_AI=1`. Pour l’essai après relecture, lancer le processus avec `DISABLE_AI=0`. Aucun appel de génération ou de voix effectué.

### 2026-11-09 — Tous les lots de code acceptés ; décision micro
- Relecteur : **lot 3 suite ACCEPTÉ** (l'élève et le modèle voient la tranche corrigée) ; **lot 2 ACCEPTÉ** en 2e
  relecture (faux positifs réglés, 17 nouveaux cas sans fausse alerte, corpus : mêmes 5 refus justifiés ; mineurs :
  équation coupée en plusieurs `\ce` non contrôlée, `outside_axes` refuse une figure posée exprès à côté des axes) ;
  **transcription ACCEPTÉE** sous réserve de décision.
- **Décision de l'utilisateur : micro** — si la transcription protégée échoue, aucun repli vers la reconnaissance du
  navigateur (Chrome enverrait la voix à Google) : message « micro indisponible », l'élève tape sa question. Confié à
  dev-exploitation (+ vrai essai de transcription dans `/api/status` si simple).

### 2026-11-09 — Jeton Vercel de développement renouvelé
- `app/.env.local` : seul `VERCEL_OIDC_TOKEN` a été remplacé après un `vercel env pull` de l’environnement `development` du projet vérifié `jcod/nesalio-app`. Expiration vérifiée au 9 novembre à 23 h 19 (Toronto). Aucun secret dans le journal.
- `DISABLE_AI=1` reste le réglage local. Pour l’essai réel après les réparations et la relecture, démarrer avec `DISABLE_AI=0` dans le processus de test. Aucun appel au modèle ni à la voix effectué lors du renouvellement.

### 2026-11-09 — Reprise après la pause
- Le dossier de notes a déménagé : `C:\Users\compt2\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\side-session-notes\local_3a01ca48-a687-4e6c-8440-e337b02675f8\`.
- **Lot 1 ACCEPTÉ** (4e relecture) : 34 questions du corpus reçoivent leur guide, 25 pièges corrects, chimie juste,
  annonces conformes au moteur. Mineurs notés (nomenclature « oxyde », « 3 × 2^x = 48 » sans guide `fonctions`, pas
  de guide d'optimisation) ; prompt système à 36 984 / 37 000 caractères (plus de place pour une annonce).
- dev-exploitation : non-conservation de la transcription seulement pour les modèles qui en ont un fournisseur ;
  whisper-1 garde l'interdiction d'entraînement seule. dev-fiabilité : version corrigée par le lot 2 jouée et rejouée,
  « noted » journalisés. Les deux en relecture. dev-justesse finit le lot 2.
- La clé `VERCEL_OIDC_TOKEN` n'est toujours pas rafraîchie (`.env.local` du 2026-11-08 09:29).

### 2026-11-09 — Reprise de l’audit
- Relevé actualisé : `app/src` compte 34 442 lignes, dont 24 743 hors tests et 9 699 de tests. Aucun nouvel import local dans le graphe de production, aucun fichier entier orphelin. Les fichiers comptés pour le retrait sont inchangés.
- Le résumé de tête reflète désormais la bascule du dépôt. L’audit reste documentaire à la demande de l’utilisateur. Prochaine étape : vérifier le premier lot sur une copie et relancer le parcours navigateur.
- Copie de retrait : 25 fichiers écartés, POST de diagnostic et lecture/purge conservés. TypeScript passe sur le code et les outils hors tests. Les six tests ciblés de `/api/nesalio`, `/api/voice` et du POST `/api/diagnostic` passent aussi. Les scénarios de 75 et 78 fichiers restent statiques.
- Arbre de travail à la reprise : 807 tests réussis, 1 échec dans `chemistry.test.ts`, 7 ignorés. TypeScript signale encore `controller.test.ts:167` avec `--incremental false`. Prochaine étape : consigner le résultat du parcours Chrome et les limites de la comparaison pédagogique.
- Audit local terminé dans `app/docs/audit-retrait-tuteur-2026-11-09.md` avec l’inventaire des 78 candidats et des 36 fichiers de tests touchés. Chrome ordinateur passe sur `/dev` avec leçon et panne de voix simulées. Mobile écarté à la demande de l’utilisateur. Les 22 archives non vides du lot `base-*` se chargent, deux exports étaient vides. Sur le même corpus, cinq sorties non vides seraient refusées par les contrôles actuels avant publication.
- Verdict : le parcours d’explication tourne sur ordinateur avec la fixture. Le tutorat interactif, le rejeu du signalement et certaines figures anciennes restent des écarts. La suite complète n’est pas verte et le flux tronqué est confirmé. Aucune suppression dans l’application. Pour statuer sur la bascule définitive, corriger ces défauts et mesurer les leçons neuves avec des accès de développement valides.

### 2026-11-09 — PAUSE demandée par l'utilisateur pour faire le point
- Agents arrêtés en cours de route : relecteur (4e passe du lot 1, non rendue), dev-justesse (corrections des 4 faux
  positifs du lot 2, en cours), dev-fiabilité (branchement des alertes du lot 2, en cours), dev-exploitation (ne pas
  envoyer la non-conservation à Whisper, en cours).
- État du code à l'arrêt : `tsc` sans erreur ; 807 tests passés, **1 en échec** (`domain/nesalio/chemistry.test.ts`,
  test de dev-justesse en train d'être mis à jour : une équation chimique doit être écrite avec `\ce{}`), 7 ignorés.
  Rien n'est commité depuis `4c8e447`, rien n'est déployé.
- Livré et accepté par le relecteur : lots 3 (fiabilité), 5 partie 1 (exploitation), 4b (rendu chimie, tableau).
  Livré, à finir : lot 1 (consignes, dernière passe non relue), lot 2 (justesse, 4 faux positifs à corriger),
  lot 6 (mesure : corpus, banc, grille, e2e). **Aucune mesure réelle depuis l'expiration de `VERCEL_OIDC_TOKEN`.**
- Pour reprendre : (1) l'utilisateur rafraîchit le jeton ; (2) finir les 3 corrections arrêtées et la relecture ;
  (3) vrai appel avec la non-conservation (compte Vercel payant ?) ; (4) banc de 31 questions (DeepSeek, Haiku 5.5,
  GPT-6 Luna) + juge visuel ; (5) verdict selon les critères Q7 ; (6) commit si accord.

### 2026-11-09 — Audit de parité et de retrait de l’ancien tuteur (en cours)
- Constat de départ sur l’arbre de travail basé sur `4c8e447` : `/` choisit Nesalio par défaut avec l’IA configurée. `/` et `/dev` conservent `TutorApp` selon les réglages. Le résumé en tête de ce fichier précède la bascule déjà consignée plus bas.
- Demande : mesurer séparément le code orphelin et l’ancien code que le nouveau parcours remplace, y compris quand l’ancien tuteur l’appelle encore. Aucun retrait demandé à ce stade.
- Vérifié dans les pages et `server/explainer.ts`. Prochaine étape : graphe des points d’entrée, décompte et essais du parcours élève.
- Décompte de `app/src` sur l’arbre de travail : 24 676 lignes hors tests, 9 624 de tests. Aucun fichier source entier orphelin dans le graphe Next. Retrait des entrées de l’ancien élève : 1 523 lignes sur 17 fichiers, avant séparation du diagnostic et des modules mixtes. Lecture et purge des séances historiques traitées séparément.
- `npm test` : 793 réussis, 2 échecs dans `pedagogy.test.ts` (parties `\ce{}` et plafond du prompt), 7 ignorés. `tsc --noEmit --incremental false` échoue sur `controller.test.ts:167`. Aucun de ces fichiers modifié pour l’audit. Prochaine étape : mesurer le retrait après extraction des briques communes et terminer le test navigateur.
- Simulation des dépendances : 2 515 lignes dans 25 fichiers après retrait des entrées tuteur et du GET de diagnostic, avec le POST Nesalio et les archives conservés. 10 110 lignes dans 75 fichiers après découplage du rendu, des types d’archives et des autres modules communs, ou 10 393 dans 78 fichiers si le schéma des événements interactifs réservé au futur est retiré aussi.
- Reproduit sur copie avec Vitest : un flux sans `end` marque la leçon partielle comme terminée et rejouable. Premier test Chromium interrompu au chargement. Prochaine étape : conclure l’essai navigateur et consigner l’inventaire dans `app/docs/audit-retrait-tuteur-2026-11-09.md`.

### 2026-11-09 — Non-conservation par modèle ; décisions voix et micro
- Chercheur (section « ZDR par modèle » de `chercheur-solutions.md`) : **DeepSeek V4.1 Flash a 13 fournisseurs ZDR**
  sur le Gateway (le relecteur se trompait ; seul le fournisseur `deepseek` ne l'est pas) → pas besoin de changer de
  modèle pour la vie privée. La non-conservation exige un **compte Vercel payant** (sinon 403) : plan non visible par
  le connecteur (équipe « Jcod ») → à vérifier par un vrai appel après rafraîchissement du jeton.
  Modèles compatibles classés : claude-haiku-5.5, gpt-6-luna, deepseek-v4.1-flash(-1017), minimax-m3.1-flash.
- Voix : `elevenlabs/eleven-flash-v2.5` n'a aucun fournisseur ZDR. **Décision : garder ElevenLabs** (seul le texte de
  Nesa y part ; c'est lui qui donne l'heure de chaque mot) — ne pas envoyer la non-conservation sur ces appels.
- Transcription : `openai/whisper-1` non ZDR. **Décision : passer à un service protégé après essai en français
  québécois** (microsoft/mai-transcribe-2, mistral/voxtral-mini-transcribe-3, spacexai/grok-stt). Confié à
  dev-exploitation (réglable + outil d'essai, pas de changement par défaut avant l'essai).

### 2026-11-09 — Lot 2 livré ; décision vie privée complète ; relectures 5, 1 (3e) et 4b
- Relecteur : **lot 5 accepté** (condition avant déploiement : `/api/status` en production) ; **lot 4b accepté**
  (condition : vidéo du nouveau `transform` ; mineurs : contour de case qui ne suit pas `move`/`dim`, LaTeX brut
  affiché si la formule ne se rend pas) ; **lot 1 à reprendre** (déclencheurs : `\b` et lettres accentuées, « gaz »,
  « concentration d'un médicament ») — toute la chimie est juste.
- **Décision de l'utilisateur : protection complète** (non-conservation + pas d'entraînement). DeepSeek n'a pas
  d'hébergeur qui s'y engage sur le Gateway (tous les appels en 400) → **changer de modèle** (Haiku 5.5 ou GPT-6
  Luna, à vérifier puis mesurer). Tant que ce n'est pas fait, la génération locale/production est cassée avec
  l'option active : ne rien déployer.
- Lot 2 (dev-justesse, `dev-justesse.md`) : `coherence.ts`, `chemistry.ts`, `sayShow.ts`, lecteur LaTeX et fractions
  exactes dans `expr.ts` ; corrige (y d'un point sur sa courbe, extrémité de segment, « = » → « ≈ ») ou refuse
  (pente, perpendicularité, hors des axes, égalité fausse, valeur finale contre `math_context`, équation non
  équilibrée, paramètre animé sans effet) ; 124 leçons réelles : 0 leçon juste refusée, 5 vraies erreurs trouvées ;
  `highlight` de case de tableau accepté. `tsc` repasse ; 766 tests.
- Relancés : relecteur (lot 2), dev-consignes (déclencheurs + annonces `\ce{}`, `column_labels`, surlignage de
  case), dev-fiabilité (jouer et rejouer la version corrigée par le lot 2), dev-exploitation (protection de la voix et
  de la transcription), chercheur (quels modèles ont un hébergeur sans conservation), dev-rendu (mineurs).

### 2026-11-08 nuit — Lot 4b livré ; guides de chimie écrits ; dépendances fixées
- dev-consignes : 10 guides de chimie (sec 4 ST, STE marqué, sec 5), calculs refaits ; retouches de la 2e relecture.
  Prompt système 36 717 caractères. 3e relecture en file.
- dev-rendu (`dev-rendu.md`, section « LIVRÉ ») : `\ce{}`/`\pu{}` via mhchemparser (`ui/board/manim/chemistry.ts`),
  vu juste sur `/dev/nesalio` ; `matrix` : cases texte (≤ 24 caractères) ou vides, `column_labels` facultatif,
  parties `r2c3`/`r2`/`c3` (`matrixParts`) ; `setMathJaxScriptUrl(null)` ; `sceneText` en écriture française ;
  `transform` sans glyphes fantômes (non vu). En attente : `validate.ts` doit accepter les parties de tableau pour
  `highlight` (demandé à dev-justesse) ; annoncer `\ce{}` et `column_labels` au modèle (dev-consignes, après la
  3e relecture) ; `transform` d'au moins 1,2 s à la lecture (lot 4a, plus tard).
- Claude Code : `package.json` → `mhchemparser` 4.2.1 en dépendance directe, `manim-web` épinglé à 0.39.4
  (`npm install --save-exact`, 0 vulnérabilité).

### 2026-11-08 nuit — Lot 5 (partie 1) livré, à relire ; points de vigilance
- dev-exploitation (`dev-exploitation.md`) : `chatCompletions.ts` envoie `providerOptions.gateway`
  (`zeroDataRetention`, `disallowPromptTraining`) ; `NESALIO_ZDR=0` retire la non-conservation ; `/dev` affiche
  NesalioApp ou TutorApp selon `explainerFor` ; questionnaire de fin ouvert au retour à l'accueil ou après 60 s
  (plus de blocage de « Revoir ») ; `/api/status` vérifie la voix ElevenLabs. Signalement avec leçon jointe : non fait
  (leçon 14 à 33 Ko > limite de 16 000 caractères du champ `replay`).
- **À VÉRIFIER AVANT TOUT DÉPLOIEMENT** : avec la non-conservation, le Gateway peut répondre 403 (compte non payant)
  ou 400 (aucun fournisseur de DeepSeek qui s'y engage) → toutes les leçons en échec. À tester par un vrai appel dès
  que `VERCEL_OIDC_TOKEN` sera rafraîchi (`.env.local` date de ce matin 09:29 : pas encore rafraîchi).
- `npx tsc` échoue en ce moment sur `domain/tutor/controller.test.ts` (ancien tuteur, non modifié) : signalé à
  dev-justesse (`expr.ts` modifié, suspect) ; travail en cours des autres lots, à revérifier à la fin.

### 2026-11-08 nuit — 2e relecture : lot 3 accepté, lot 1 à retoucher
- **Lot 3 ACCEPTÉ** (`relecture-lot3.md`, 2e relecture : 166 tests, 10 scénarios du relecteur corrigés).
  Limite acceptée et à garder en tête : une tranche illisible dont l'identifiant ne se lit pas est tenue pour
  corrigée par la tranche acceptée suivante (rare, signalé dans le journal serveur).
- Lot 1 à retoucher : détecteur de formule chimique trop large (P1, A1, « prix d'équilibre » perdent leur guide de
  maths), ordre des phrases de la consigne de refus, message de correction qui exige 3 à 5 tranches même pour un refus.
  Renvoyé à dev-consignes avec le guide de chimie.

### 2026-11-08 nuit — Décisions vie privée et modèles ; lots repris ; lot 5 lancé
- Décisions de l'utilisateur : **vie privée** → chaque appel au Gateway demande la non-conservation des données et
  l'interdiction d'entraînement ; **modèles à mesurer** contre DeepSeek : `anthropic/claude-haiku-5.5` et
  `openai/gpt-6-luna` (dès que `VERCEL_OIDC_TOKEN` sera rafraîchi).
- Lot 3 repris (7 demandes, 166 tests nesalio, 14 neutralisations sur copie) ; lot 1 repris (9 demandes, 159 tests,
  prompt système 36 484 caractères). Deuxième relecture en cours.
- dev-consignes : guide de chimie sec 4/5 à partir de la liste R4. dev-rendu : en plus, virgule décimale dans
  `sceneText`. Lancé : dev-exploitation (lot 5 : vie privée dans `chatCompletions.ts`, `/dev` → NesalioApp,
  questionnaire de fin qui ne bloque plus, `/api/status` sur la voix réelle, signalement avec leçon si petit).

### 2026-11-08 nuit — Relectures, lot 6 livré, chercheur, lots 2 et 4b lancés
- Relecteur (`relecture-lot3.md`, `relecture-lot1.md`) : lots 3 et 1 **à reprendre** (tranche jouée avant celle qui
  manque ; faux déclencheurs du refus sur des problèmes de maths en contexte, doublons du dictionnaire, « 4.0 ») ;
  renvoyés aux développeurs. L'« incident » de `generator.ts` venait du relecteur (neutralisation en place puis
  remise depuis une copie) ; désormais neutralisations sur copie.
- Lot 6 (dev-mesure, `dev-mesure.md`) : corpus `app/tools/eval/corpus-nesalio.json` (31 questions : 22 maths, 10
  chimie sec 4/5), banc `tools/eval/banc-nesalio.test.mjs` (`BANC=1`, `TUTOR_MODEL`), grille
  `app/docs/grille-explication-nesalio.md`, e2e `tools/e2e/nesalio.mjs` (passe sur une copie ; la page `/` exige un
  compte → accès de test sans compte à prévoir au lot 5). 700 tests. **Essai réel impossible : `VERCEL_OIDC_TOKEN`
  expiré** (à rafraîchir par l'utilisateur : `npx vercel env pull .env.local --environment=development` dans app/).
- Chercheur (`chercheur-solutions.md`) : manim-web 0.39.4 = MathJax 4 sans mhchem → `mhchemparser` (installé)
  convertit `\ce{}` ; justesse : étendre `expr.ts` + fractions exactes d'`assessment.ts` (pas mathjs, Compute
  Engine en outil de test seulement) ; objets manim-web (Angle, Brace…) ; programme de chimie (MEQ 2011 ; plusieurs
  notions sont STE et non ST) ; analyseur de formules neuf ; modèles à mesurer : `anthropic/claude-haiku-5.5`,
  `openai/gpt-6-luna`, `deepseek/deepseek-v4.1-flash-1017` (Grok : `spacexai/…`, pas de variante rapide).
  **Risque vie privée** : aucune option de non-conservation ni d'interdiction d'entraînement envoyée au Gateway
  (données d'élèves mineurs) ; MathJax peut se charger depuis jsdelivr.
- Lancés : dev-justesse (lot 2), dev-rendu (lot 4b + tableau de chimie).

### 2026-11-08 nuit — Lots 3 (P1) et 1 livrés, en relecture
- Lot 3 (dev-fiabilité, `dev-fiabilite.md`) : ligne illisible renvoyée au modèle au lieu d'être jetée ; leçon jamais
  « end » s'il manque une tranche ; `escapeLatex`/`restoreLatex` repris de l'ancien système ; la leçon de refus
  `hors_perimetre` (une tranche) n'est pas relancée pour MIN_SLICES. Tests : neutralisations faites. Pas de
  génération réelle.
- Lot 1 (dev-consignes, `dev-consignes.md`) : périmètre maths + chimie sec 4-5 et refus poli (leçon d'une tranche
  `hors_perimetre`) ; règles de l'ancien prompt reprises ; règles de justesse ; dictionnaire « notion → image » ;
  leçon d'exemple avec figure qui bouge ; ancres `side_a`/`side_b`/`hypotenuse` annoncées ; guides : statistiques,
  probabilités, finances, systèmes, valeur absolue, géométrie analytique, lois des sinus/cosinus, polynômes
  complétés ; guide physique remplacé par le refus ; `CHEMISTRY_GUIDES` vide (attend R4). Prompt système
  26 837 → 38 398 caractères.
- **Incident** : une session hors de l'équipe a réécrit `generator.ts` pendant le lot 3 et effacé ses changements ;
  réappliqués, état vérifié (148/148 tests nesalio, `tsc` OK). Autre session suspectée : Codex ou la session
  mère, qui partagent ce dossier.
- Relecteur en cours sur le lot 3 puis le lot 1. Chercheur et dev-mesure en cours.

### 2026-11-08 nuit — Décisions de l'utilisateur et première vague de l'équipe
- Mesure du testeur (`testeur-mesure-depart.md`) : 20 questions (16 maths, 4 chimie) : 85 % intactes, 2 échecs en
  chimie (tableau `matrix` limité aux nombres), note 58,6/100, 9 erreurs graves (surtout figures qui contredisent
  les nombres). Juge visuel (`juge-visuel.md`) : 3,6/10. Liste des manques : `analyste-backlog.md` (9 bloquants,
  lots 1 à 7 sur fichiers disjoints).
- Séances réelles chez Vercel : `vercel env pull` refusé à l'IA par le garde-fou (secrets de production) ; script
  `app/tools/eval/questions-seances.mjs` prêt pour l'utilisateur ; **partie mise de côté par l'utilisateur**.
- Décisions : Q6 erreur de justesse détectée → corriger ce qui se calcule, sinon refuser ; Q4 tableau chimie →
  champs facultatifs (en-têtes de colonne, cases texte) + surlignage de case ; Q1 hors périmètre → refus poli ;
  Q2 → mesurer d'autres modèles pour comparer (l'utilisateur veut **moins cher et plus performant** que DeepSeek si
  besoin, Grok cité) ; par défaut (sans réponse) : Q5 ancres de polygone puis objets calculés, Q7 critères proposés,
  Q8 leçon jointe au signalement. **En attente : Q3 enregistrement des séances**, Q9 voix, Q10 micro.
- Lancés : chercheur (R1-R6), dev-fiabilité (lot 3, P1), dev-consignes (lot 1), dev-mesure (lot 6). Seuls des
  fichiers disjoints ; aucun commit ; `SUIVI.md` tenu par Claude Code.

### 2026-11-08 nuit — Claude Code (testeur) : mesure de départ, 20 questions maths + chimie
- Suite `base-*` (`analyses/generations/`, avec `.lisible.txt` ; rendu `analyses/outils/lisible.mjs`) : 16 maths + 4 chimie ;
  4 questions de physique notées à part (périmètre réduit à maths + chimie, décision utilisateur). Un tirage, un appel.
- 17/20 intactes (2 échecs en chimie : tableau `matrix` limité aux nombres, 1re tranche refusée 3 fois ; `zeros` a perdu
  une tranche sur une ligne JSON illisible jetée sans rien dire, `generator.ts` l. 193-197). 1re tranche : médiane 2,6 s, max 4,7 s.
- Note moyenne 58,6/100 (65,1 sur les leçons jouées) ; 9 erreurs graves dans 9 leçons sur 18, dont 7 figures ou tableaux
  qui contredisent les nombres. Rapport et problèmes priorisés : `testeur-mesure-depart.md` (dossier de notes). Correcteur
  unique, pas à l'aveugle : indicatif. Rien dans `app/src`, rien commité.

### 2026-11-08 nuit — Décision de périmètre : mathématiques et chimie seulement
- L'utilisateur : l'outil se concentre sur les **mathématiques et la chimie**. La physique sort du périmètre pour
  l'instant (à mettre en « plus tard »). Transmis à l'analyste, au testeur (questions de physique remplacées par de la
  chimie) et au juge visuel. À reporter dans `pedagogy.ts` (le texte dit encore « sciences physiques ») et dans les
  guides (aucun guide de chimie aujourd'hui).
- Audit `audit-casse.md` revenu : 12 passerelles à couper, ~87 fichiers de production à supprimer, ordre en 9 étapes,
  pièges (`.next/types/validator.ts`, `tools/analyse/seances.ts` dans tsconfig, cron de purge dans `vercel.json`,
  `test:e2e` à réécrire). Servira le jour de la suppression ; à faire avant : `/dev` doit afficher `NesalioApp`.

### 2026-11-08 nuit — Claude Code : notation sur questions nouvelles (grille stricte) — Nesalio en dessous
- Notation à l'aveugle, 10 nouvelles questions, grille /100 avec plafonnement d'exactitude
  (`notation-grille-resultats.md`, lettres décodées par Claude Code) : **ancien tuteur 62,6 ; Nesalio un appel 54,5 ;
  deux temps 47,7**. Nesalio nettement en dessous sur les notions sans guide (corrélation 30 contre 59, Newton 28
  contre 67, médiatrice 56 contre 81) ; mieux sur intérêts composés (86 contre 75). Mesure de Nesalio faite avant les
  corrections de fiabilité. **L'avantage mesuré sur les 8 questions de départ ne se généralise pas.**
- Audits revenus : `audit-fonctions.md` (à refaire avant : `/dev` affiche encore TutorApp, test e2e sur l'ancien,
  `/api/status` sur la voix Gemini, purge des séances à garder ; à décider : enregistrement des séances par
  Nesalio, contexte du signalement, micro pendant l'explication) ; `audit-a-garder.md` (archive
  `archives/tuteur-2026-11/` proposée, règles pédagogiques et trous des guides à reprendre).
- Équipe : testeur (mesure de départ), analyste (liste des manques) et juge visuel (qualité « à la 3Blue1Brown »)
  lancés. L'utilisateur précise : **au moins 5 agents** ; les scénarios de vrais utilisateurs sont les séances
  enregistrées chez Vercel (`/api/seances`, jeton `SELFTEST_TOKEN` ou stockage Blob ; absent de `app/.env.local`).

### 2026-11-08 nuit — Claude Code : équipe de 5 agents pour rendre Nesalio fiable
- Objectif reformulé par l'utilisateur : **pouvoir se fier au nouveau système** ; implémenter ce qui manque ;
  **l'ancien système n'est PAS supprimé** tant que le nouveau n'est pas opérationnel à 100 %.
- Règle pour combler un manque : bibliothèque externe reconnue d'abord (vérifiée : fiabilité, entretien, licence,
  sécurité, poids, compatibilité, données envoyées à un tiers) ; sinon reprise de l'ancien système ; sinon code neuf.
- Équipe (rôles fixes, la balle passe par Claude Code) : analyste (liste des manques classés) → chercheur
  (bibliothèque ou reprise) → développeur (seul à écrire dans app/src) ↔ relecteur → testeur (vrai système, grille)
  → retour à l'analyste.
- Critères proposés pour « on peut s'y fier » : ≥ 95 % de leçons au bout sur ~20 questions variées ; aucune erreur
  mathématique grave ; notes ≥ ancien tuteur sur des questions nouvelles ; manques bloquants présents et testés.
- Lancé : le testeur (mesure de départ, 20 questions, `testeur-mesure-depart.md`).

### 2026-11-08 nuit — Claude Code : commit avant suppression, audits lancés
- Fiabilité après les 4 corrections (`nr-*`, 10 nouvelles questions, un appel) : **10/10 leçons au bout**
  (avant : 9/10 avec `nq-*`) ; première tranche 1,5 à 10 s.
- Commit `4c8e447` (accord de l'utilisateur) : tout le travail Nesalio. `.gitignore` : images des vidéos
  (`analyses/videos/frames-*/`) et journaux de mesure (`analyses/*.log`) exclus.
- Avant toute suppression, demandé par l'utilisateur : trois agents en lecture seule (rapports dans le dossier de
  notes) — `audit-fonctions.md` (ce que l'ancien système fait et que Nesalio doit avoir avant), `audit-casse.md`
  (ce qui casserait, ordre des étapes), `audit-a-garder.md` (ce qu'il faut garder ou archiver pour l'orchestrateur
  et le futur tuteur). Notation à l'aveugle des 10 nouvelles questions avec la grille : en cours.
- Rien n'est supprimé.

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
