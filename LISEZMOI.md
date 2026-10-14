# Nesalio — site et plan de mesure du smoke test

Tous les fichiers du dossier vont à la racine du dépôt (voir la section 5). Pas de build, pas de dépendance.

---

## 1. Ce que la page mesure

La page n'est pas seulement une liste d'attente. Chaque élément répond à une question précise :

| Question d'entrepreneur | Ce qui la mesure sur la page | Où lire le chiffre |
|---|---|---|
| Les gens vivent-ils ce problème, et à quelle fréquence ? | Sondage en un clic « Ça t'arrive souvent ? » (Chaque semaine / Quelques fois par session / Rarement / Jamais) | Champ `frequence_probleme` des inscrits ; événement `sondage_frequence` pour tous les visiteurs (PostHog) |
| Le problème est-il assez douloureux pour qu'ils agissent déjà ? | Étape 2 : « La dernière fois que tu as bloqué, qu'as-tu fait ? » et « Combien dépense ta famille par mois ? » | Champs `derniere_fois` et `depense_mensuelle` |
| Est-ce urgent maintenant ? | Étape 2 : « Ton prochain examen important, c'est quand ? » | Champ `urgence` |
| La solution intéresse-t-elle ? | Lancement et fin de la démo, réponses, interruptions | Champs `demo` et `parcours` ; événements `demo_debut`, `demo_fin` |
| Sont-ils prêts à essayer ? | Clics sur « Essayer gratuitement » puis inscription | Événements `clic_essayer`, `inscription` ; nombre d'inscrits |
| Sont-ils prêts à payer ? | Bouton choisi dans les tarifs : Essai (0 $) ou prix fondateur (99 $ par mois au lieu de 199 $). Aucun paiement n'est demandé. | Champ `formule` (`aucune`, `essai`, `fondateur`) |
| Qui achète ? | « Tu es » (élève sec 4, sec 5, cégep, parent, enseignant) | Champ `profil` |
| D'où viennent les meilleurs prospects ? | Paramètre `?src=` des liens partagés | Champ `source` |
| Accepteront-ils une vraie conversation ? | Case « J'accepte qu'on me contacte 15 minutes » | Champ `appel_15_min` |

Chaque inscription arrive avec son **parcours complet**, par exemple :
`arrivee:facebook-parents > demo_debut:cine > demo_reponse_fausse:cine > demo_fin:cine > sondage_frequence:chaque_semaine > clic_formule:fondateur > inscription:fondateur`

Tu sais donc, pour chaque personne, si elle a regardé la démo, ce qu'elle a répondu au sondage et sur quel bouton elle a cliqué.

---

## 2. Les indicateurs à calculer

Calcule-les à la fin de chaque campagne (export CSV de Formspree, plus les visiteurs de Vercel ou PostHog).

**A. Intensité du problème**
- **Problème fréquent** = (« Chaque semaine » + « Quelques fois par session ») ÷ total des réponses au sondage.
- **Problème qui fait agir** = inscrits qui ont coché autre chose que « Rien, j'ai laissé tomber » ÷ inscrits ayant répondu à l'étape 2.
- **Problème qui coûte** = inscrits qui dépensent plus de 0 $ par mois ÷ inscrits ayant répondu.
- **Urgence** = (« Dans moins de 2 semaines » + « Ce mois-ci ») ÷ inscrits ayant répondu.

**B. Attrait de la solution**
- **Taux de lancement de la démo** = visiteurs ayant lancé une séance ÷ visiteurs.
- **Taux de fin de la démo** = séances terminées ÷ séances lancées.
- **Effet de la démo** = taux d'inscription des visiteurs qui ont terminé la démo, comparé à celui des autres.

**C. Intention d'essayer**
- **Taux de clic** = visiteurs ayant cliqué « Essayer » au moins une fois ÷ visiteurs.
- **Taux d'inscription** = inscrits (étape 1) ÷ visiteurs uniques.
- **Taux de qualification** = inscrits ayant rempli l'étape 2 ÷ inscrits.

**D. Intention de payer**
- **Signal payant** = inscrits dont `formule` = `fondateur` ÷ inscrits. C'est le chiffre clé : ces personnes ont vu « 99 $ par mois » et ont cliqué quand même.
- **Signal payant par profil** = même calcul pour les parents seuls. À 99 $, c'est surtout le parent qui paie : si les élèves cliquent mais pas les parents, le prix n'est pas validé.

**E. Conversation**
- **Acceptation d'entrevue** = « Oui » à l'appel de 15 minutes ÷ inscrits ayant rempli l'étape 2.

Découpe toujours ces chiffres par `profil` (élève, cégep, parent) et par `source`. Un taux global peut cacher un segment qui convertit très bien.

---

## 3. Seuils de décision proposés

Ce sont des **seuils de départ à valider avec ton EER**, pas des normes de l'industrie. Fixe-les **avant** de lancer la campagne, pour ne pas les ajuster après coup.

| Indicateur | Signal fort | À creuser | Signal faible |
|---|---|---|---|
| Problème fréquent | 50 % et plus | 30 à 50 % | Moins de 30 % |
| Problème qui coûte | 25 % et plus | 10 à 25 % | Moins de 10 % |
| Taux d'inscription (visiteurs) | 5 % et plus | 2 à 5 % | Moins de 2 % |
| Signal payant (inscrits) | 30 % et plus | 15 à 30 % | Moins de 15 % |
| Acceptation d'entrevue | 20 % et plus | 10 à 20 % | Moins de 10 % |

Point de repère tiré de la formation Centech (Raphaëlle Fluet) : une validation de produit par groupes Facebook, à 0 $, a obtenu 465 visites et un taux de conversion de 3,4 % en 8 jours.

**Taille minimale avant de conclure :** environ 300 visiteurs par source ou par segment, sur 8 à 14 jours. En dessous, un ou deux inscrits de plus changent tout le pourcentage.

**Comment lire les combinaisons :**
- Problème fréquent **et** signal payant élevés : le problème est réel et la solution attire. Passe aux entrevues de prix et au prototype.
- Problème fréquent, mais faible taux d'inscription : le problème existe, mais la page ou la solution ne convainc pas. Teste un autre titre ou une autre démo.
- Beaucoup d'inscrits, mais peu de signal payant : intérêt réel, mais pas encore de valeur perçue pour payer. Creuse en entrevue ce qui manque.
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
3. Dans `index.html`, cherche `var FORM_ENDPOINT` et remplace `VOTRE_ID` par cet identifiant.

Chaque personne envoie **deux soumissions** : l'étape 1 (inscription, toujours) et l'étape 2 (questions, si elle les remplit). Elles sont reliées par le courriel. L'offre gratuite de Formspree est limitée en nombre de soumissions par mois : vérifie la limite actuelle sur leur site et prends le forfait payant si ta campagne dépasse.

Tant que `VOTRE_ID` n'est pas remplacé, le formulaire affiche un message d'erreur au lieu d'envoyer.

### Statistiques sur tous les visiteurs (PostHog, recommandé)

Sans PostHog, tu as le parcours détaillé des **inscrits** seulement. Avec PostHog, tu as aussi celui des visiteurs qui ne s'inscrivent pas : combien ont répondu au sondage, lancé la démo ou cliqué sur un prix sans aller au bout. C'est indispensable pour calculer les taux A à D sur tous les visiteurs.

1. Crée un compte gratuit sur https://posthog.com (région US ou EU).
2. Copie la clé du projet (`phc_…`) et colle-la dans `index.html`, à la ligne `var POSTHOG_KEY = '';`.
3. Si tu choisis la région EU, remplace `us-assets.i.posthog.com` et `us.i.posthog.com` par `eu-assets.i.posthog.com` et `eu.i.posthog.com`.
4. Dans PostHog, crée un **entonnoir** (Funnel) : `page_vue` → `demo_debut` → `clic_essayer` ou `clic_formule` → `inscription`.

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
| `llms.txt` | Résumé en texte simple pour les assistants IA : ce qu'est Nesalio, pour qui, les notions, le prix, la différence avec ChatGPT |
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
- **Garde les faits à jour** : si le prix ou les matières changent, modifie en même temps la FAQ, le JSON-LD et `llms.txt`.

---

## 7. La démo

- Trois exemples de séance, écrits à l'avance et joués dans la page (aucun serveur, aucune IA appelée) : `quad` (maths sec 4 SN, zéros d'une parabole), `cine` (physique sec 5, pente et vitesse en MRU) et `deriv` (cégep, dérivée).
- La voix utilise la synthèse vocale du navigateur quand une voix française existe. Sur certains appareils, elle sonne robotique : teste-la sur ton téléphone.
- Les textes sont dans le script de `index.html`, dans les objets `SCRIPTS.quad`, `SCRIPTS.cine` et `SCRIPTS.deriv`.

---

## 8. À vérifier avant de publier

- **Prix : 199 $ par mois, 99 $ par mois pour les premiers inscrits.** Le prix fondateur est promis « tant que l'abonnement reste actif » : c'est un engagement à respecter au lancement. Pour changer les prix, modifie la section `tarifs` et l'objet `PLANS` du script. Garde-les fixes pendant toute une campagne, sinon les résultats ne se comparent pas.
- **Le prix de 199 $ doit être réel.** La loi québécoise sur la protection du consommateur encadre les prix barrés : n'annonce 199 $ que si c'est vraiment le prix auquel tu comptes vendre après la période fondatrice.
- **Les engagements doivent être tenus** : « Essai gratuit de 7 jours », « Prix fondateur garanti », « Aucune carte demandée ». Si tu ne peux pas les tenir, retire-les.
- **Textos** : la page demande un consentement explicite (Loi canadienne anti-pourriel). N'envoie des textos qu'aux personnes qui ont coché la case, identifie Nesalio dans le message et respecte immédiatement « ARRÊT ».
- **Confidentialité** : relis `confidentialite.html` (tu y es nommé responsable). C'est un bon point de départ, pas un avis juridique.
- **Histoire de Joyce** : obtiens son accord, et celui d'un parent, avant de publier, même sous forme anonyme.

## Studio Nesa (nesalio.com/studio)

Outil interne pour fabriquer les visuels de la mascotte, dans les couleurs Nesalio. Page non indexée (meta noindex).

- **Personnaliser** : 9 expressions (repos, écoute, réfléchit, explique, concentré, content, bravo, surpris, clin d'œil), 4 palettes, 5 fonds, visage sur la face de droite ou de gauche, clignement, regard, respiration, accessoires.
- **Animer** : ligne de temps d'expressions avec durées, transitions douces, 4 animations prêtes (séance, salut, il cherche, il parle).
- **Planche** : toutes les expressions côte à côte.
- **Exporter** : SVG, PNG 1024 px, code SVG copié, GIF animé, vidéo (MP4 ou WebM).
- Liens directs : `/studio#etat=bravo` (ajouter `&stop` pour figer), `/studio#planche`.
- Les réglages sont gardés dans le navigateur. `window.NesaStudio.render(...)` donne le SVG par code.
