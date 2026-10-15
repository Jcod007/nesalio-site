# Nesalio — site et plan de mesure du smoke test

Tous les fichiers du dossier vont à la racine du dépôt (voir la section 5). Pas de build, pas de dépendance.

---

## 1. Ce que la page mesure

La page n'est pas seulement une liste d'attente. Chaque élément répond à une question précise :

| Question d'entrepreneur | Ce qui la mesure sur la page | Où lire le chiffre |
|---|---|---|
| Les gens vivent-ils ce problème, et à quelle fréquence ? | Sondage en un clic « Ça t'arrive souvent ? » (Chaque semaine / Quelques fois par session / Rarement / Jamais) | Champ `frequence_probleme` des inscrits ; événement `sondage_frequence` pour tous les visiteurs (PostHog) |
| Le problème est-il réel et assez douloureux pour qu'ils agissent déjà ? | Étape 2, une question par écran. Deux questions ouvertes sur un fait réel : « Raconte la dernière fois où tu as bloqué. C'était sur quoi ? » et « Qu'est-ce que tu as fait pour t'en sortir ? Est-ce que ça a marché ? ». Puis « Combien dépense ta famille par mois ? » | Champs `notion` et `derniere_fois` (texte libre, à lire et à classer à la main), `depense_mensuelle` |
| Est-ce urgent maintenant ? | Étape 2 : « Ton prochain examen important, c'est quand ? » | Champ `urgence` |
| La solution intéresse-t-elle ? | Vidéos de séance regardées, et jusqu'au bout ou non | Champs `demo` et `parcours` ; événements `video_vue`, `video_choix`, `video_fin` |
| Quelles matières intéressent le plus ? | Onglets de la section « Les notions de ton cours » (Fonctions, Calcul, Mécanique, Électricité, Optique, Chimie) | Événement `onglet_matiere` dans le champ `parcours` |
| Sont-ils prêts à essayer ? | Clics sur « Essayer gratuitement » puis inscription | Événements `clic_essayer`, `inscription` ; nombre d'inscrits |
| Jusqu'où sont-ils prêts à s'engager ? | Bouton choisi dans la section démo : « M'avertir à l'ouverture » (engagement faible) ou « Réserver ma démo » de 15 minutes (engagement fort). Tous les autres boutons « Réserver une démo » comptent comme une démo. Aucun prix n'est affiché. | Champ `formule` (`avertir`, `demo`) |
| Qui achète ? | « Tu es » (élève sec 4, sec 5, cégep, parent, enseignant) | Champ `profil` |
| D'où viennent les meilleurs prospects ? | Paramètre `?src=` des liens partagés | Champ `source` |
| Accepteront-ils une vraie conversation ? | Réservation d'une démo de 15 minutes, avec cellulaire obligatoire | Champs `formule` = `demo` et `cellulaire` |

Chaque inscription arrive avec son **parcours complet**, par exemple :
`arrivee:facebook-parents > video_vue:quad > video_vue:proj > video_fin:proj > sondage_frequence:chaque_semaine > clic_formule:demo > inscription:demo`

Tu sais donc, pour chaque personne, quelles vidéos elle a regardées, ce qu'elle a répondu au sondage et sur quel bouton elle a cliqué.

---

## 2. Les indicateurs à calculer

Calcule-les à la fin de chaque campagne (export CSV de Formspree, plus les visiteurs de Vercel ou PostHog).

**A. Intensité du problème**
- **Problème fréquent** = (« Chaque semaine » + « Quelques fois par session ») ÷ total des réponses au sondage.
- **Problème qui fait agir** = réponses à « Qu'est-ce que tu as fait ? » qui décrivent une action réelle (ChatGPT, tuteur, ami, enseignant…) ÷ réponses reçues. Lis-les une par une et classe-les : c'est aussi là que tu trouveras les mots exacts des gens pour ta page et ton pitch.
- **Problème qui coûte** = inscrits qui dépensent plus de 0 $ par mois ÷ inscrits ayant répondu.
- **Urgence** = (« Dans moins de 2 semaines » + « Ce mois-ci ») ÷ inscrits ayant répondu.

**B. Attrait de la solution**
- **Taux de visionnage** = visiteurs ayant vu au moins une vidéo ÷ visiteurs (la première se lance seule, sans son, quand elle est visible).
- **Matières qui intéressent** = nombre de clics `onglet_matiere` par matière. Compare-le avec la matière nommée dans la question ouverte « C'était dans quelle matière ? ».
- Les images de cette section sont générées par `tools/notions.py` (puis relancer `tools/make_en.py`).
- **Taux de fin** = vidéos regardées jusqu'au bout ÷ vidéos lancées.
- **Effet des vidéos** = taux d'inscription des visiteurs qui ont vu une vidéo jusqu'au bout, comparé à celui des autres.

**C. Intention d'essayer**
- **Taux de clic** = visiteurs ayant cliqué « Essayer » au moins une fois ÷ visiteurs.
- **Taux d'inscription** = inscrits (étape 1) ÷ visiteurs uniques.
- **Taux de qualification** = inscrits ayant rempli l'étape 2 ÷ inscrits.

**D. Intention de payer**
- **Signal démo** = inscrits dont `formule` = `demo` ÷ inscrits. C'est le chiffre clé : ces personnes acceptent de donner 15 minutes de leur temps, ce qui vaut plus qu'un simple courriel.
- **Signal démo par profil** = même calcul pour les parents seuls. C'est le parent qui paiera : si les élèves réservent mais pas les parents, l'acheteur n'est pas validé. La volonté de payer se mesure ensuite pendant la démo (question sur le prix) et avec la question « combien dépense ta famille ».

**E. Conversation**
- **Acceptation d'entrevue** = inscrits qui réservent une démo (`formule` = `demo`) ÷ inscrits. Pendant la démo, refais les questions ouvertes à l'oral et demande combien la famille paierait.

Découpe toujours ces chiffres par `profil` (élève, cégep, parent) et par `source`. Un taux global peut cacher un segment qui convertit très bien.

---

## 3. Seuils de décision proposés

Ce sont des **seuils de départ à valider avec ton EER**, pas des normes de l'industrie. Fixe-les **avant** de lancer la campagne, pour ne pas les ajuster après coup.

| Indicateur | Signal fort | À creuser | Signal faible |
|---|---|---|---|
| Problème fréquent | 50 % et plus | 30 à 50 % | Moins de 30 % |
| Problème qui coûte | 25 % et plus | 10 à 25 % | Moins de 10 % |
| Taux d'inscription (visiteurs) | 5 % et plus | 2 à 5 % | Moins de 2 % |
| Signal démo (inscrits) | 30 % et plus | 15 à 30 % | Moins de 15 % |
| Acceptation d'entrevue | 20 % et plus | 10 à 20 % | Moins de 10 % |

Point de repère tiré de la formation Centech (Raphaëlle Fluet) : une validation de produit par groupes Facebook, à 0 $, a obtenu 465 visites et un taux de conversion de 3,4 % en 8 jours.

**Taille minimale avant de conclure :** environ 300 visiteurs par source ou par segment, sur 8 à 14 jours. En dessous, un ou deux inscrits de plus changent tout le pourcentage.

**Comment lire les combinaisons :**
- Problème fréquent **et** signal démo élevés : le problème est réel et la solution attire. Fais les démos et pose la question du prix pendant l'appel.
- Problème fréquent, mais faible taux d'inscription : le problème existe, mais la page ou la solution ne convainc pas. Teste un autre titre ou d'autres vidéos.
- Beaucoup d'inscrits, mais peu de démos réservées : intérêt réel, mais pas encore de valeur perçue pour payer. Creuse en entrevue ce qui manque.
- Problème peu fréquent : vérifie le segment. Le problème est peut-être plus aigu chez un autre profil (cégep, parents, élèves en SN).

---

## 4. Lancer la campagne

1. Crée un lien par canal, avec `?src=` :
   - `nesalio.com/?src=fb-parents-laval` (groupes Facebook de parents)
   - `nesalio.com/?src=insta-reel-1` (contenu pour les élèves)
   - `nesalio.com/?src=prof-farid` (lien remis par un enseignant)
   - `nesalio.com/?src=ami` est déjà utilisé par le bouton de partage.
2. Même message partout, sauf ce que tu veux tester. Ne change qu'une chose à la fois.
3. Dans les 48 h, écris à chaque personne qui a accepté l'appel de 15 minutes. Pose des questions sur leur comportement passé (« raconte-moi la dernière fois que… »), pas sur un futur hypothétique.

---

## 5. Mise en ligne

### Formulaire (Formspree)

1. Crée un compte sur https://formspree.io, puis un formulaire « Accès anticipé Nesalio ».
2. Copie son identifiant (ex. `xyzabcd` dans `https://formspree.io/f/xyzabcd`).
3. Dans `index.html`, cherche `var FORM_ENDPOINT` et remplace `VOTRE_ID` par cet identifiant. (fait : formulaire « Nesalio - inscriptions », `xrpeoeqv`, compte contact@nesalio.com).

Chaque personne envoie **deux soumissions** : l'étape 1 (inscription, toujours) et l'étape 2 (questions, si elle les remplit). Elles sont reliées par le courriel. L'offre gratuite de Formspree est limitée en nombre de soumissions par mois : vérifie la limite actuelle sur leur site et prends le forfait payant si ta campagne dépasse.

Tant que `VOTRE_ID` n'est pas remplacé, le formulaire affiche un message d'erreur au lieu d'envoyer.

### Statistiques sur tous les visiteurs (PostHog, recommandé)

Sans PostHog, tu as le parcours détaillé des **inscrits** seulement. Avec PostHog, tu as aussi celui des visiteurs qui ne s'inscrivent pas : combien ont répondu au sondage, regardé une vidéo ou cliqué sur un prix sans aller au bout. C'est indispensable pour calculer les taux A à D sur tous les visiteurs.

1. Crée un compte gratuit sur https://posthog.com (région US ou EU).
2. Copie la clé du projet (`phc_…`) et colle-la dans `index.html`, à la ligne `var POSTHOG_KEY = '';`.
3. Si tu choisis la région EU, remplace `us-assets.i.posthog.com` et `us.i.posthog.com` par `eu-assets.i.posthog.com` et `eu.i.posthog.com`.
4. Dans PostHog, crée un **entonnoir** (Funnel) : `page_vue` → `video_choix` → `clic_essayer` ou `clic_formule` → `inscription`.

La page initialise PostHog sans témoins persistants (`persistence: 'memory'`) : chaque visite est comptée, sans pistage d'une visite à l'autre.

### Hébergement (Vercel) et domaine

Tous les fichiers du dossier vont à la racine du dépôt : `index.html`, `confidentialite.html`, `vercel.json`, `robots.txt`, `sitemap.xml`, `llms.txt`, `favicon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `og-image.png`.

1. **GitHub** : crée un dépôt `nesalio-site` (privé, c'est possible), puis « Add file », « Upload files » et glisse tous les fichiers. Ou, en ligne de commande : `git init`, `git add .`, `git commit -m "Site Nesalio"`, puis `git push`.
2. **Vercel** : connecte-toi avec GitHub, « Add New… », « Project », importe `nesalio-site`, laisse Framework Preset à « Other », puis « Deploy ». Le site est en ligne sur une adresse `*.vercel.app` en moins d'une minute.
3. **Domaine** : dans le projet Vercel, Settings, puis Domains, ajoute `nesalio.com`. Vercel propose d'ajouter aussi `www.nesalio.com` : accepte, et choisis la redirection de `www` vers `nesalio.com` (une seule adresse officielle, c'est mieux pour le SEO).
4. **DNS chez Namecheap** : Domain List, puis Manage, puis Advanced DNS. Crée exactement les enregistrements que Vercel affiche, en général :
   - `A` : hôte `@`, valeur `76.76.21.21`
   - `CNAME` : hôte `www`, valeur `cname.vercel-dns.com`
   Supprime les enregistrements « parking » de Namecheap qui pointent ailleurs (souvent un `CNAME www` et un `URL Redirect @`). Ne touche pas aux enregistrements `MX` et `TXT` du courriel.
5. Attends que Vercel affiche « Valid Configuration » (quelques minutes, parfois quelques heures). Le HTTPS s'active tout seul.
6. **nesalio.ca** : ajoute-le dans Vercel avec redirection vers `nesalio.com`, et crée chez Namecheap les mêmes enregistrements pour ce domaine.
7. Active **Web Analytics** dans Vercel.

---

## 6. Référencement : Google et moteurs IA

### Ce qui est déjà fait dans les fichiers

| Élément | Rôle |
|---|---|
| `<title>` et `meta description` en français, avec les mots que les gens tapent (tuteur, maths, sciences, secondaire 4-5, cégep, programme québécois) | Ce que Google affiche dans les résultats |
| `canonical` vers `https://nesalio.com/` | Une seule adresse officielle, pas de contenu en double |
| `hreflang="fr-CA"` | Indique que la page vise le Québec francophone |
| Balises Open Graph et Twitter avec `og-image.png` (1200 × 630) | Belle vignette quand le lien est partagé sur Facebook, Messenger, LinkedIn, X |
| Données structurées JSON-LD : `Organization`, `WebSite`, `WebPage`, `FAQPage` | Aident Google et les IA à comprendre qui vous êtes, ce que fait Nesalio et ses réponses officielles |
| FAQ qui commence par « Qu'est-ce que Nesalio ? », « Pour qui ? », « Combien ça coûte ? » | Réponses courtes et factuelles : c'est le format que les IA reprennent et citent |
| `robots.txt` qui autorise Google, Bing et les robots des IA (OAI-SearchBot et GPTBot d'OpenAI, ClaudeBot, PerplexityBot, Google-Extended, Applebot) | Personne n'est bloqué ; le fichier pointe vers le sitemap |
| `sitemap.xml` | La liste des pages à indexer |
| `llms.txt` | Résumé en texte simple pour les assistants IA : ce qu'est Nesalio, pour qui, les notions, l'accès, la différence avec ChatGPT |
| Contenu principal en HTML (pas généré en JavaScript) | Lisible par tous les robots, y compris ceux qui n'exécutent pas de JavaScript |
| `vercel.json` : URL propres (`/confidentialite`), en-têtes de sécurité, cache des images | Site rapide et propre |

### Ce que tu dois faire après la mise en ligne

1. **Google Search Console** (https://search.google.com/search-console) : ajoute la propriété « Domaine » `nesalio.com`, vérifie-la avec l'enregistrement `TXT` qu'on te donne (à ajouter chez Namecheap), puis, dans Sitemaps, soumets `https://nesalio.com/sitemap.xml`. Utilise ensuite « Inspection de l'URL », puis « Demander l'indexation » pour la page d'accueil.
2. **Bing Webmaster Tools** (https://www.bing.com/webmasters) : importe ton site depuis Search Console en un clic. C'est important pour l'IA : la recherche de ChatGPT et Copilot s'appuie en grande partie sur l'index de Bing.
3. **Teste les données structurées** : https://search.google.com/test/rich-results avec `https://nesalio.com/`. Aucune erreur ne doit apparaître.
4. **Teste la vignette de partage** : colle le lien dans Messenger ou LinkedIn et vérifie que l'image et le titre s'affichent.
5. **Teste la vitesse** : https://pagespeed.web.dev avec `https://nesalio.com/`.

### Ce qui fera vraiment monter Nesalio (Google comme IA)

Les balises aident Google et les IA à comprendre la page. Ce qui fait monter, ce sont les **mentions et les liens venant d'autres sites**, et du **contenu qui répond à des questions précises**.

- **Mentions de confiance** : demande une page ou un lien au Centech (fiche des entreprises incubées), à Polytechnique, à des enseignants, à des groupes de parents. Les IA citent surtout des sources qui sont elles-mêmes citées ailleurs.
- **Profils cohérents** : crée LinkedIn (page entreprise), Instagram et TikTok @nesalio avec la même phrase de description que la page : « Tuteur à la voix propulsé par l'IA pour le secondaire 4-5 et le cégep au Québec. » Mets le lien `nesalio.com` partout.
- **Une page par notion, plus tard** : par exemple `nesalio.com/notions/factorisation` ou `/notions/loi-des-sinus`, chacune avec une vraie explication, un exemple résolu et une question de vérification. C'est ce que les élèves cherchent sur Google (« comment factoriser secondaire 4 ») et ce que les IA aiment citer. Commence par les notions que les inscrits nomment le plus souvent dans le formulaire.
- **Garde les faits à jour** : si l'offre ou les matières changent, modifie en même temps la FAQ, le JSON-LD et `llms.txt`.

---

## 7. Les vidéos de séance

Le haut de la page montre trois courtes vidéos (dossier `videos/`, en MP4 et WebM, avec une image d'aperçu) :

- Maths sec 4 : les zéros d'une parabole (1 min). L'élève interrompt, Nesa réexplique, trouve ce qui bloque (une notion de sec 3) et lui fait trouver la réponse.
- Physique sec 5 : la pente du graphique position-temps, c'est la vitesse (46 s).
- Cégep : c'est quoi une dérivée (47 s).

La première vidéo se lance seule, sans son, quand elle est visible ; on peut cliquer dessus pour la mettre en pause. Nesa, à côté de l'écran, parle pendant la lecture.

Les vidéos ont été enregistrées à partir de l'ancienne démo interactive (toujours dans l'historique Git, commit `a535918`). Pour en refaire une : relancer cette démo en local, l'enregistrer avec Playwright (800 × 600), puis encoder en MP4 (H.264) et WebM (VP9).

## 8. À vérifier avant de publier

- **Démos : tiens l'engagement.** Chaque personne qui réserve une démo doit recevoir une réponse rapide et une vraie séance de 15 minutes. Prépare au moins une séance montrable (prototype ou séance guidée) avant de lancer la campagne.
- **Les engagements doivent être tenus** : « Démo gratuite de 15 min », « Sans engagement ». Si tu ne peux pas les tenir, retire-les.
- **Textos** : la page demande un consentement explicite (Loi canadienne anti-pourriel). N'envoie des textos qu'aux personnes qui ont coché la case, identifie Nesalio dans le message et respecte immédiatement « ARRÊT ».
- **Confidentialité** : relis `confidentialite.html` (tu y es nommé responsable). C'est un bon point de départ, pas un avis juridique.
- **Histoire de Joyce** : obtiens son accord, et celui d'un parent, avant de publier, même sous forme anonyme.

## Nesa, la mascotte

Une seule forme pleine, violet #5A45D6, deux yeux blancs en gélule, pas de bouche. Au repos c'est un cube arrondi ; elle se transforme selon ce que fait le tuteur.

- États : `repos`, `ecoute` (ondes qui arrivent), `parle` (ondes qui partent), `reflechit` (point d'interrogation), `stylo` (trace une courbe au tableau), `idee` (ampoule), `bravo` (étoile), `content`, `clin`.
- `nesa.js` : moteur + composant. `<script src="/nesa.js" defer></script>` puis `<nesa-mascot state="ecoute" size="140"></nesa-mascot>` ; changer d'état : `el.state = "stylo"`.
- Moteur : silhouettes en profils radiaux (même échantillonnage, donc transformation = interpolation des rayons), yeux posés sur une sphère, clignements pré-tirés ; rendu = fonction pure du temps. Principes inspirés du projet MIT « bloub », code écrit pour Nesalio.
- `nesalio.com/mascotte` : page interne (non indexée) qui présente Nesa, ses 9 états, et permet de télécharger GIF, PNG et SVG. `/studio` y redirige.

## Articles

Les articles (`/articles`) sont générés par `tools/articles.py` à partir de `tools/articles_content.py` (texte, sources).
Pour en ajouter un : ajoute une entrée dans `articles_content.py`, relance `python3 tools/articles.py`, puis ajoute l'adresse dans `sitemap.xml` et `llms.txt`.
Chaque chiffre doit venir d'une source vérifiée, listée en bas de l'article. Le bouton de chaque article mène à la démo avec `?src=article-<nom>`, pour mesurer quel article amène des inscriptions.

