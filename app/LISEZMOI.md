# Nesalio — prototype de l'application

L'élève pose sa question (au clavier ou à voix haute). Nesa répond à voix haute
en construisant l'explication au tableau, étape par étape, avec les animations
de Manim. L'élève peut l'interrompre à tout moment (« Attends, je comprends
pas »), lui poser une question sur ce qui est au tableau, puis reprendre.

- **Next.js 16 + TypeScript**, déployé sur Vercel.
- **manim-web** pour le tableau : repère, courbes, vecteurs, `Create`,
  `GrowArrow`, `Indicate`, `FadeOut`, caméra pour le zoom.
- **OpenRouter** pour le modèle (configurable), appelé uniquement côté serveur.
- **Voix du navigateur** pour Nesa et pour le micro (en attendant une voix clonée).

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis coller la clé OpenRouter
npm run dev                  # http://localhost:3000
npm test                     # tests unitaires (moteur, langage de scène, serveur)
npm run typecheck
```

Sans `OPENROUTER_API_KEY`, l'application joue trois séances de démonstration
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
           BoardState (pur) ─▶ ManimRenderer (manim-web)        OpenRouter (flux SSE)
                  │          ─▶ NotesColumn (calculs)
                  └─▶ Speaker (voix) · Dock (sous-titres, choix, interruption)
```

| Dossier | Rôle | Dépend de |
|---|---|---|
| `src/domain/` | Le cœur, sans React ni réseau : langage de scène (Zod), parseur d'expressions sûr, état du tableau, planification des tracés, validation de la sortie du modèle | rien |
| `src/engine/` | `Player` : la machine à états qui joue les étapes, gère l'interruption et la reprise. `ports.ts` définit ce dont il a besoin (voix, source, horloge) | `domain` |
| `src/server/` | Route `/api/tutor`, consignes du modèle, appel OpenRouter, limite d'usage | `domain`, `content` |
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
5. **Interruption** : la voix se coupe, l'élève pose sa question. Le lecteur
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

Commandes : `axes`, `curve`, `point`, `vector`, `segment`, `text`, `note`,
`tag`, `highlight`, `erase`, `focus`, `resetView`. Pour en ajouter une : la
déclarer dans le schéma, l'appliquer dans `board/state.ts`, lui donner une
durée dans `timeline/plan.ts`, la dessiner dans `ManimRenderer.build()`, puis
la décrire dans `prompt.ts`. Les tests signalent ce qui manque.

## Déploiement (Vercel)

1. Importer le dépôt dans Vercel (cadre Next.js détecté automatiquement).
2. Variables d'environnement : `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
   (facultatif), `NEXT_PUBLIC_APP_URL=https://app.nesalio.com`.
3. Domaine : ajouter `app.nesalio.com` au projet, puis l'enregistrement DNS
   indiqué par Vercel.
4. Sur le site nesalio.com, faire pointer le bouton « Essayer Nesalio » (ou la
   fin de l'inscription) vers `https://app.nesalio.com`.

## Limites connues du prototype

- **Limite d'usage en mémoire** (20 questions par 10 minutes et par adresse) :
  approximative sur Vercel, car chaque instance a son compteur. Pour la
  production, la brancher sur un stockage partagé (Upstash Redis).
- **Voix du navigateur** : la qualité dépend de l'appareil. Le port `Speaker`
  permet de brancher une voix clonée (voir ci-dessous) sans toucher au moteur.
- **Micro** : reconnaissance vocale du navigateur (Chrome, Edge, Safari). Le
  bouton est masqué ailleurs.
- **Petits écrans** : un repère très large (par exemple 0 à 40 m) devient petit
  sur téléphone ; on peut zoomer avec deux doigts.
- Aucun compte, aucune donnée enregistrée : les questions passent par le
  modèle et ne sont pas conservées par l'application.

## Brancher une voix clonée

1. Créer la voix chez le fournisseur choisi (voir la recommandation dans la
   conversation : ElevenLabs ou Cartesia), avec l'accord écrit de la personne
   dont c'est la voix.
2. Ajouter une route serveur `/api/voice` qui reçoit une phrase et renvoie
   l'audio du fournisseur (la clé reste côté serveur).
3. Écrire un `Speaker` (`src/services/voice/`) qui joue cet audio et dont
   `estimate()` renvoie la durée réelle du fichier ; le brancher dans
   `src/ui/hooks/useTutor.ts`.
