# Nesalio — prototype de l'application

L'élève pose sa question (au clavier ou à voix haute). Nesa répond à voix haute
en construisant l'explication au tableau, étape par étape, avec les animations
de Manim. L'élève peut l'interrompre à tout moment (« Attends, je comprends
pas »), lui poser une question sur ce qui est au tableau, puis reprendre.

- **Next.js 16 + TypeScript**, déployé sur Vercel.
- **manim-web** pour le tableau : repère, courbes, vecteurs, `Create`,
  `GrowArrow`, `Indicate`, `FadeOut`, caméra pour le zoom.
- **Claude** (API de la console Claude, `ANTHROPIC_API_KEY`) pour le modèle,
  appelé directement par le serveur ; à défaut, OpenRouter ou Vercel AI Gateway.
- **Vercel AI Gateway** pour la voix de Nesa et la transcription du
  micro, appelé uniquement côté serveur. Sur Vercel, l'authentification est
  automatique (jeton OIDC) : aucune clé à gérer. OpenRouter reste possible
  pour le modèle.
- **Repli automatique** : sans service d'IA, séances de démonstration, voix du
  navigateur et reconnaissance vocale du navigateur.

## Démarrer

```bash
npm install
vercel env pull .env.local   # jeton OIDC pour AI Gateway (ou voir .env.example)
npm run dev                  # http://localhost:3000
npm test                     # tests unitaires (moteur, langage de scène, serveur)
npm run typecheck
```

Sans accès à AI Gateway (ni `OPENROUTER_API_KEY`), l'application joue trois séances de démonstration
(zéros d'une quadratique, portée d'un projectile, dérivée) et l'indique par une
étiquette « Démonstration » en haut de l'écran.

## Architecture

Le principe : **le modèle ne dessine jamais**. Il décrit l'explication dans un
petit langage de scène ; tout est validé avant d'atteindre le tableau.

```
Navigateur                                           Serveur (Vercel)
───────────                                          ─────────────────
QuestionInput ─▶ Player ─▶ TutorSource (HTTP) ──POST /api/tutor──▶ service.ts
   (micro)        │  ▲                                                │
                  │  └──── étapes validées, en flux NDJSON ◀──────────┤ modelOutput.ts (validation)
                  │                                                   │ prompt.ts (consignes + exemple)
                  ▼                                                   ▼
     graphe de scène (pur) ─▶ ManimRenderer (manim-web)   AI Gateway (flux SSE)
       + moteur de placement ─▶ DiagnosticTag
                  └─▶ Speaker (voix) · Dock (sous-titres, choix, interruption)
```

| Dossier | Rôle | Dépend de |
|---|---|---|
| `src/domain/` | Le cœur, sans React ni réseau : langage de scène (Zod), parseur d'expressions sûr, état du tableau, planification des tracés, validation de la sortie du modèle | rien |
| `src/engine/` | `Player` : la machine à états qui joue les étapes, gère l'interruption et la reprise. `ports.ts` définit ce dont il a besoin (voix, source, horloge) | `domain` |
| `src/server/` | Routes `/api/tutor`, `/api/voice`, `/api/transcribe`, `/api/status` ; consignes du modèle, appels à AI Gateway, limites d'usage | `domain`, `content` |
| `src/services/` | Implémentations navigateur des ports : voix, micro, client HTTP | `domain`, `engine` |
| `src/ui/` | Écran : tableau manim-web, carte de Nesa, colonne de calculs, accueil | tout le reste |
| `src/content/` | Séances de démonstration écrites dans le langage de scène (servent aussi d'exemple au modèle et aux tests) | `domain` |

### Comment les éléments communiquent

1. **Question** → `Player.ask()` ouvre une « séquence » et appelle `/api/tutor`.
2. Le serveur envoie les consignes et une séance d'exemple au modèle, lit sa
   réponse **en flux**, repère chaque objet JSON, le corrige si l'écart est
   sans ambiguïté (`line` → `segment`, identifiant manquant…), le valide, et le
   renvoie aussitôt au navigateur. La première étape est jouée pendant que le
   modèle écrit les suivantes.
3. Pour chaque étape, `planStep()` étale les tracés sur la durée de la phrase.
   Le lecteur applique les commandes à l'état du tableau avec leurs heures de
   départ, puis fait parler Nesa.
4. Le tableau est une **projection de l'état** : `ManimRenderer` compare l'état
   reçu à ce qu'il a déjà dessiné et lance les animations manquantes avec
   `scene.playWithTimestamps()`, aux heures prévues, ce qui synchronise le
   tracé avec la voix.
5. **Échange par tours** : un tour (1 à 3 étapes) se termine sur une question
   posée à l'élève. Le serveur coupe alors l'appel au modèle et envoie
   `{"kind":"await"}`. Dès que l'élève répond, le lecteur demande le tour
   suivant (`mode: "continue"`, avec sa réponse et l'état du tableau) pendant
   que Nesa réagit à voix haute ; le modèle adapte la suite (confirmation,
   ou remédiation ciblée sur l'erreur probable). Une question sans bonne
   réponse sert à situer l'élève (ce qu'il connaît déjà).
6. **Interruption** : la voix se coupe, l'élève pose sa question. Le lecteur
   empile une séquence de réponse et envoie au modèle ce qui a été dit et ce
   qui est au tableau (`summarizeBoard`). Nesa répond en réutilisant les
   objets du tableau, puis la séance reprend à l'étape suivante.

### Le langage de scène

Défini dans `src/domain/scene/schema.ts`. Une réponse du modèle est une suite
de lignes JSON :

```json
{"kind":"lesson","title":"Les zéros d'une fonction quadratique","topic":"Fonctions · sec 4"}
{"kind":"step","say":"Le sommet est au point 2, 3.","mood":"dessine","do":[{"type":"point","id":"s","at":[2,3],"label":"(2, 3)","ring":true}]}
{"kind":"step","say":"À toi.","mood":"question","do":[],"check":{"prompt":"Combien de zéros ?","choices":["0","1","2"],"answer":0,"ifRight":"Bravo !","ifWrong":"Presque."}}
{"kind":"end","summary":["Forme canonique : lire le sommet"]}
```

Commandes (registre `src/domain/scene/commands/`) : `axes`, `curve`, `point`,
`vector`, `segment`, `text` (posé à côté d'un objet avec `near`), `note`
(ligne de calcul), `tag`, `group`, `move`, `transform`, `highlight`, `dim`,
`undim`, `erase`, `clear`, `focus`, `resetView`.

Chaque commande est un module unique : son schéma (validation), sa
documentation pour le modèle (générée dans les consignes), sa durée et son
effet sur le graphe de scène. Pour en ajouter une : écrire le module et
l'inscrire dans `commands/index.ts`. Le rendu n'a pas à changer tant que la
commande manipule des nœuds existants (il dessine des nœuds, pas des commandes).

### Le graphe de scène

`src/domain/board/state.ts` est la représentation abstraite du tableau : des
nœuds (courbe, point, vecteur, segment, texte) avec leur apparition, leur
déplacement cumulé, leur dernière transformation et leur estompage ; des
groupes ; des relations (un texte ancré à un objet le suit et disparaît avec
lui) ; la pile de calculs. `src/domain/board/layout.ts` est le moteur de
placement : l'IA dit « à côté de A », il choisit la place libre (en évitant
textes, points, courbes et axes) et range les calculs en colonne à côté de la
figure, en faisant de la place quand elle est pleine. Le rendu Manim ne fait
que projeter ce graphe (Create, Shift, ReplacementTransform, fondus, Indicate).

## Déploiement (Vercel)

1. Importer le dépôt dans Vercel (cadre Next.js détecté automatiquement).
2. Aucune variable obligatoire : AI Gateway est authentifié par le jeton OIDC
   de Vercel. Variables facultatives : voir `.env.example`.
3. Domaine : ajouter `app.nesalio.com` au projet, puis l'enregistrement DNS
   indiqué par Vercel.
4. Sur le site nesalio.com, faire pointer le bouton « Essayer Nesalio » (ou la
   fin de l'inscription) vers `https://app.nesalio.com`.

## Limites connues du prototype

- **Limite d'usage en mémoire** (40 tours par 10 minutes et par adresse) :
  approximative sur Vercel, car chaque instance a son compteur. Pour la
  production, la brancher sur un stockage partagé (Upstash Redis).
- **Voix** : générée phrase par phrase (Gemini TTS via AI Gateway), préchargée
  pour éviter les blancs ; la première phrase met environ une seconde de plus.
- **Micro** : la fin de la phrase est détectée par le silence (1,4 s), puis la
  phrase est transcrite par le serveur. Il faut autoriser le micro.
- **Petits écrans** : un repère très large (par exemple 0 à 40 m) devient petit
  sur téléphone ; on peut zoomer avec deux doigts.
- Aucun compte, aucune donnée enregistrée : les questions passent par le
  modèle et ne sont pas conservées par l'application.

## Vérifier un déploiement

`/api/diagnostic?check=<SELFTEST_TOKEN>&ask=<question>` joue une séance
complète côté serveur avec un élève simulé : `voice=1` (micro simulé),
`model=<id>` (autre modèle d'AI Gateway), `effort=none|low|medium|high`
(réflexion du modèle, principal levier de latence), `answers=right|wrong`.
Le rapport donne, tour par tour, le délai avant la première phrase, les gestes
(objets qui bougent ou se transforment) et les phrases « dites sans montrer ».

## Mesurer avant / après un changement

- **Banc d'évaluation** : `tools/eval/evaluer.mjs` joue les questions de
  `tools/eval/questions.json` contre `/api/diagnostic` et enregistre les mesures
  dans `tools/eval/resultats/` (gestes, dit sans montrer, rejets, cibles absentes,
  latence). À lancer avant et après chaque changement de consigne ou du moteur :
  `NESALIO_URL=https://app.nesalio.com SELFTEST_TOKEN=… node tools/eval/evaluer.mjs`.
- **Rejeu visuel** : `tools/rejeu/seance.py` rejoue une séance enregistrée (les
  événements du diagnostic avec `raw=1`) dans le navigateur, sur un serveur
  local (`npx next start -p 3100`), et capture une image par phrase ;
  `tools/rejeu/rafale.py` prend une rafale d'images pendant un geste.
  `tools/rejeu/partitions/` contient les moments clés de 5 vidéos de
  3Blue1Brown écrits dans le langage de Nesa (tests du moteur).

## Retours des testeurs

Le bouton « Signaler un problème » (en haut de l'outil) envoie le retour au même
formulaire Formspree que les inscriptions du site, avec `etape` = `retour-outil`
(ou à `FEEDBACK_ENDPOINT` si la variable est définie). Si la personne laisse la
case cochée, le retour contient sa question, les dernières phrases de Nesa, le
tableau, son écran, son navigateur et le champ `rejeu` : l'enregistrement exact
de ce que le serveur lui a envoyé. Pour revoir sa séance à l'identique :

```
# coller le contenu du champ « rejeu » dans seance.json, puis
npx next build && npx next start -p 3100
python3 tools/rejeu/seance.py /tmp seance.json essai "[]"
```

## La boucle d'une séance

1. Premier tour : Nesa fixe 2 ou 3 objectifs (le dernier est l'idée centrale),
   montre, puis pose une question de prédiction. Chaque choix porte l'erreur de
   raisonnement qu'il révèle (`why`).
2. L'élève répond ; le navigateur relit le tour qui finit (gestes, phrases dites
   sans montrer, objets absents : `domain/tutor/turnReview.ts`).
3. Tour suivant : le modèle reçoit les objectifs, toutes les réponses de l'élève
   avec l'erreur visée, et la relecture de son propre tour. Il se corrige sans
   délai supplémentaire.

## Changer la voix de Nesa

- **Autre voix prédéfinie** : variables `VOICE_NAME` (par exemple `Kore`,
  `Zephyr`, `Puck`) et `VOICE_INSTRUCTIONS` (ton, rythme, accent).
- **Voix clonée** (la tienne ou celle d'une personne qui donne son accord
  écrit) : créer la voix chez ElevenLabs ou Cartesia, puis remplacer l'appel
  de `src/server/ai/audio.ts > synthesizeSpeech` par l'API du fournisseur. La
  route `/api/voice` et le lecteur côté navigateur restent identiques.
