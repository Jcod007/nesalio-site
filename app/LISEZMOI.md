# Nesalio — prototype de l'application

L'élève pose sa question (au clavier ou à voix haute). Nesa répond à voix haute
en construisant l'explication au tableau, tranche par tranche, avec les animations
de Manim. Elle pose parfois une question à l'élève pour vérifier qu'il suit.
L'élève peut mettre en pause, couper le son et revoir l'explication.

- **Next.js 16 + TypeScript**, déployé sur Vercel.
- **manim-web** pour le tableau : repère, courbes, vecteurs, `Create`,
  `GrowArrow`, `Indicate`, `FadeOut`, caméra pour le zoom.
- **Claude** (API de la console Claude, `ANTHROPIC_API_KEY`) pour le modèle,
  appelé directement par le serveur ; à défaut, OpenRouter ou Vercel AI Gateway.
- **Vercel AI Gateway** pour la voix de Nesa et la transcription du
  micro, appelé uniquement côté serveur. Sur Vercel, l'authentification est
  automatique (jeton OIDC) : aucune clé à gérer. OpenRouter reste possible
  pour le modèle.
- **Sans service d'IA** : la page indique que Nesa est indisponible. Sans voix,
  la leçon se joue en sous-titres.
- **Comptes préparés** : connexion et inscription Clerk par code courriel.
  Activer l'instance Clerk et ses clés avant de déployer cette version ; voir
  [la configuration et les vérifications](docs/authentication.md). Sans configuration,
  les API privées refusent les requêtes. Aucun fournisseur n'est créé implicitement.

## Démarrer

```bash
npm install
vercel env pull .env.local   # jeton OIDC pour AI Gateway (ou voir .env.example)
npm run dev                  # http://localhost:3000
npm test                     # tests unitaires (moteur, langage de scène, serveur)
npm run typecheck
npm run check                # format et lint (Biome) ; npm run format corrige le format
npm run test:e2e             # parcours réel dans le navigateur (ordinateur + téléphone), app lancée à part
```

## Accès privé au développement

Configurer sur le serveur `NESALIO_DEV_ACCESS_TOKEN` avec un secret aléatoire
d'au moins 32 caractères. Ouvrir `https://app.nesalio.com/dev/access` et y entrer
le secret : la page installe un cookie sécurisé puis ouvre `/dev`, sans compte
Nesalio. Le secret ne se met jamais dans l'adresse (elle reste dans les journaux
et l'historique). Conserver ce secret confidentiel : il donne accès à Nesa, à la
voix et à la transcription sans limites applicatives. Le cookie expire après
7 jours ; changer le secret révoque les cookies précédents. Les coûts et quotas des fournisseurs
restent applicables. Sans secret configuré, l'accès reste fermé.

Ces vérifications tournent seules sur GitHub à chaque pull request et à chaque push dans `main` (`.github/workflows/ci.yml`) : format et lint, types, tests unitaires, build, puis le parcours dans le navigateur en mode démonstration (sans IA : `NESALIO_LOCAL_DEMO=1 DISABLE_AI=1 npm run dev`, réservé au local, le parcours répond lui-même à `/api/nesalio` et `/api/voice`). Ne fusionne une pull request que si elles sont vertes.

## Séances enregistrées

Chaque leçon (une requête à `/api/nesalio`) est enregistrée après la réponse dans
le magasin Vercel Blob **privé** `nesalio-seances` (Montréal) : la question de l'élève,
le modèle, l'attente avant la première tranche, l'issue (complète, interrompue, erreur)
et exactement le flux envoyé (en-tête, tranches, questions), donc rejouable. Ni nom,
ni courriel, ni IP, ni audio. Voir `src/domain/sessionLog.ts` (`LessonRecord`).
Les fichiers d'avant le 2026-11-10 sont des tours de l'ancien tuteur, gardés jusqu'à
leur purge. Pas encore enregistré : les réponses de l'élève aux questions posées
pendant la leçon (elles restent dans le navigateur).
Analyse : `tools/analyse/seances.ts` ; questions des élèves : `tools/eval/questions-seances.mjs`.
En local seulement, `NESALIO_GARDER_LECONS=1` garde chaque leçon Nesalio jouée
(`src/server/nesalio/keepLesson.ts`).

- Chemin : `production/AAAA-MM-JJ/<session courte>/<heure>-nesalio.json` (anciens tours : `<heure>-<mode>.json`)
  (la session courte est celle des retours « Signaler un problème »).
- Consulter : `/api/seances?jour=AAAA-MM-JJ[&session=xxxxxxxx][&env=preview]`, avec
  l'en-tête `Authorization: Bearer <SELFTEST_TOKEN>` (jamais le jeton dans l'URL).
- Conservation : 12 mois, purge quotidienne (`vercel.json`, `/api/seances/purge`, `CRON_SECRET`).
- Désactiver : `RECORD_SESSIONS=0` (ou sans `BLOB_READ_WRITE_TOKEN`, en local).

## Architecture

Le principe : **le modèle ne dessine jamais**. Il décrit la leçon en JSON Nesalio
(v3.3 : tranches, temps forts, repères de voix, actions) ; tout est réparé quand
l'écart est sans ambiguïté, puis validé avant d'atteindre le tableau.

```
Navigateur                                        Serveur (Vercel)
───────────                                       ─────────────────
NesalioApp ─▶ NesalioSession ──POST /api/nesalio──▶ server/nesalio/generator.ts
                 │  ▲                                  │ prompt.ts (consignes)
                 │  └── tranches validées, flux NDJSON ◀┤ normalize.ts + validate.ts
                 ▼                                      │ review.ts (relecture)
   nesalioPlayback (temps, caméra, tranchePlan)         ▼
        ─▶ NesalioProjection (manim-web)          modèle (écriture + relecture)
        ─▶ voix (/api/voice) · NesalioDock (sous-titres, questions)
```

| Dossier | Rôle |
|---|---|
| `src/domain/nesalio/` | Le format Nesalio, sans React ni réseau : contrat, réparations (`normalize`), validation, placement, état de la scène, mesure des textes et formules, questions à l'élève |
| `src/engine/` | La séance (`nesalioSession`), la lecture image par image (`nesalioPlayback`), la caméra planifiée par tranche (`tranchePlan`) |
| `src/server/nesalio/` | Génération en flux, consignes, relecture, conservation locale des leçons |
| `src/app/api/` | `nesalio`, `voice`, `transcribe`, `status`, `diagnostic` (POST de vérification), `feedback`, `apres-essai`, `seances` (lecture et purge des archives) |
| `src/ui/` | Écran : tableau manim-web (`ui/board/manim`), dock, accueil, retours |
| `src/domain/board`, `src/domain/scene` | Briques reprises de l'ancien tuteur et encore utilisées : mesures, primitives de rendu, accès aux étapes des séances archivées |

Détails : `docs/plan-bascule-nesalio.md`, `docs/nesalio-espace-camera.md`,
`docs/chantier-camera.md`, `docs/synchronisation-voix-tableau.md`.

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
- Comptes préparés dans cette version (activation Clerk requise). Les questions
  sont conservées si l'enregistrement privé Vercel Blob est activé ; voir la
  section « Séances enregistrées » et la politique de confidentialité.

## Vérifier un déploiement

`POST /api/diagnostic`, avec l'en-tête `Authorization: Bearer <SELFTEST_TOKEN>`, valide
une leçon Nesalio assemblée ou une sortie du modèle, sans appeler de fournisseur.
(L'ancienne séance complète en GET a été retirée avec le tuteur le 2026-11-10.)

## Mesurer avant / après un changement

- **Banc Nesalio** : `BANC=1 npx vitest run tools/eval/banc-nesalio.test.mjs` génère
  les questions de `corpus-nesalio.json` par le vrai chemin de la route et compte les
  leçons intactes, les échecs, les délais et le coût.
- **Captures** : `node tools/eval/captures-nesalio.mjs <travaux.json>` joue des leçons
  sur `/dev/nesalio` et garde une image du tableau toutes les 5 secondes.
- **Caméra** : `CAMERA=1 npx vitest run tools/eval/camera-banc.test.mjs`.
- **Parcours navigateur** : `npm run test:e2e` (`tools/e2e/nesalio.mjs`), ordinateur
  et téléphone, accessibilité (axe) comprise.
- `tools/eval/questions.json`, `questions-sn4.json` et `program-check.mjs` (critères du
  programme : méthode de la classe, notation québécoise) sont gardés : ils servaient
  à l'ancien banc et pourront être branchés sur le banc Nesalio.

## Retours des testeurs

Le bouton « Signaler un problème » (en haut de l'outil) envoie le retour au même
formulaire Formspree que les inscriptions du site, avec `etape` = `retour-outil`
(ou à `FEEDBACK_ENDPOINT` si la variable est définie). Si la personne laisse la
case cochée, le retour contient sa question, les dernières phrases de Nesa, le
tableau, son écran, son navigateur et le champ `rejeu` : l'enregistrement exact
de ce que le serveur lui a envoyé (vide pour une leçon Nesalio pour l'instant).

## Changer la voix de Nesa

- **Autre voix prédéfinie** : variables `VOICE_NAME` (par exemple `Kore`,
  `Zephyr`, `Puck`) et `VOICE_INSTRUCTIONS` (ton, rythme, accent).
- **Voix clonée** (la tienne ou celle d'une personne qui donne son accord
  écrit) : créer la voix chez ElevenLabs ou Cartesia, puis remplacer l'appel
  de `src/server/ai/audio.ts > synthesizeSpeech` par l'API du fournisseur. La
  route `/api/voice` et le lecteur côté navigateur restent identiques.


## Essai avant connexion

Le tuteur offre trois reponses sans compte avant la connexion par code courriel.
Le serveur utilise un temoin signe et les compteurs prives partages du magasin Blob.
Configurer TRIAL_COOKIE_SECRET ; voir docs/authentication.md pour les limites et controles.
La transcription cloud reste reservee aux comptes ; les invites peuvent utiliser
la dictee du navigateur si elle est disponible, ou le clavier.
