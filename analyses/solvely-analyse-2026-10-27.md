# Analyse de Solvely avec REA

Date : 27 octobre 2026. Cible demandée : https://solevly.ai.

## Résultat principal

L'adresse demandée redirige vers https://solvely.ai/, puis la session observée arrive sur /home. Solvely propose une application d'aide à l'étude qui regroupe résolution de problèmes, outils de mémorisation, préparation aux examens, rédaction, prise de notes et préparation professionnelle.

Cette analyse porte sur les interfaces publiques et une session invitée. Elle ne récupère pas le code serveur et ne valide pas les promesses commerciales de précision des réponses.

## Méthode et preuves

REA 6.8.0, capture_browser_scenario, Chrome en mode headless, profil temporaire sans connexion, viewport de 1280 × 720. REA a effectué les navigations et clics déclarés. Les trois captures signalent la terminaison du navigateur dont elles étaient propriétaires.

| Preuve REA | Périmètre |
| --- | --- |
| ev_6bd3c8b434a349c492c257978a02edc9875e6b9eb8f32d9e096ae83d7b83e98d | Redirection, DOM, arbre d'accessibilité, requêtes réseau au chargement |
| ev_6288fefab2377d92ffffb8d99bcba1b3d119ee4d8751b8be1af1c7ace7e94fdd | Clics Exam Prep, Writing, Study, Flashcards, Quiz, Study Guide, Whiteboard Tutor |
| ev_6eb9b0a4339eb3fe347957155ce7ce85a7e18641f1489a6d0ea298aa234eda1b | Career Hub, AI Live Notes, AI Study, soumission d'un problème simple |

Les identifiants désignent les preuves de la session REA ; ce rapport en conserve les conclusions, pas une exportation complète de leurs données.

## Fonctionnalités et parcours observés

| Module | Interface observée | Limite de vérification |
| --- | --- | --- |
| Solver | Saisie de question, import de document ou d'image, exemples de solutions détaillées, graphes, chimie et comptabilité | La soumission du test exige une connexion |
| Whiteboard Tutor | Question ou sujet, import de supports, bouton Start lesson, exemples d'explications guidées | Aucune leçon générée |
| Flashcards | Sujet, notes ou diapositives, images, lien YouTube, bouton Create cards | Aucune génération ni répétition espacée testée |
| Quiz | Même entrée multimodale, bouton Create quiz, exemples de questions | Adaptativité annoncée dans l'interface, non vérifiée |
| Study Guide | Sujet ou supports, bouton Create study guide, exemples structurés | Aucune génération testée |
| Exam Prep | Objectif d'examen, supports à importer, bouton Create plan | Planning, maîtrise des thèmes, examens blancs et suivi présentés par des exemples |
| Writing | AI Humanizer, AI Detector, Plagiarism Checker, AI Paraphraser, AI Citation, AI Research | Outils listés ; aucun résultat ni taux de fiabilité vérifié |
| AI Study | /quiz/home, création de study sets, flashcards, quiz, solver, guide, exam predictor, cheat sheet | Une fenêtre d'accueil apparaît ; création non testée |
| Career Hub | /home/ai-interview, Mock Interview, Polish Resume, New job target | Entretiens et retouches de CV non exécutés |
| AI Live Notes | /home/ai-note, transcription, organisation de notes, édition/export, Q&A et multilingue présentés | Aucun enregistrement audio ni accès au microphone demandé |
| Anatomie / 3D | Entrée de navigation observée sous des libellés variables | Module non exploré |

L'accueil utilise trois modes principaux, Study, Exam Prep et Writing. Les sous-onglets adaptent la zone de saisie, les boutons d'import, le bouton d'action et les exemples sans quitter /home.

Des liens vers l'App Store, Google Play et une extension Chrome sont visibles. Leur installation et leurs fonctions ne font pas partie de cette analyse.

## Test de résolution et connexion

Entrée saisie : « Solve 2x + 3 = 7. Explain each step. »

Le clic Solve conduit à /history/answer-ask avec un identifiant d'intention temporaire. Un écran de connexion apparaît : Google, email et QR code pour un compte mobile. Aucune réponse au problème n'a été produite dans la session invitée observée. Aucune création de compte ni paiement effectué.

L'interface affiche Try Free et Upgrade. Cela suggère un parcours d'acquisition avec montée en gamme, mais ne suffit pas à établir les tarifs, quotas, durées d'essai ou conditions de facturation.

## Technologies observables

| Indice | Conclusion et degré de certitude |
| --- | --- |
| Bundles vendor-vue, vue-core, fichiers .vue et styles n-modal | Forte indication d'un frontend Vue avec Naive UI ; versions et architecture interne non vérifiées |
| Bundles vendor-element, vendor-axios-lodash | Ressources nommées pour Element, Axios et Lodash chargées ; usage exact non tracé |
| Scripts Firebase et appels firebaseinstallations.googleapis.com | Intégration Firebase observable ; schéma de données et responsabilités serveur inconnus |
| accounts.google.com/gsi/client | Client Google Identity chargé, cohérent avec le bouton de connexion Google |
| js.stripe.com/v3 et document Stripe | Intégration client Stripe observable ; paiement et abonnement non testés |
| MathJax, JSXGraph, GeoGebra, Mathpix Markdown | Bibliothèques de rendu mathématique et graphique chargées ; chaque moteur n'a pas été exercé |
| Bundles pdfjs, pdf-lib, tiptap | Indices de fonctions PDF et d'édition riche ; fonctionnement complet non vérifié |
| /ai-note-client/ et vendor-micro-app | Indices de séparation modulaire de l'interface ; topologie complète non établie |
| PostHog, Clarity, Plausible, Bing, Adjust | Plusieurs intégrations de mesure et d'attribution chargées ; contenu exact transmis non audité |

API publique contactée au chargement : https://api-web.solvely.ai.

Chemins observés : GET /experiments/browser-payload, POST /experiments/resolve-safe, POST /pricing/ai-writing/offer, GET /product/guest. Ces requêtes proviennent du chargement normal de la page ; leurs noms ne démontrent pas leur logique interne. Aucun appel artificiel à ces endpoints n'a été ajouté.

Les ressources d'expérimentation et des libellés de navigation différents entre sessions suggèrent des variantes d'interface. Le mécanisme d'affectation n'a pas été vérifié.

Le chargement d'un SDK de mesure OpenAI ne prouve pas que les réponses pédagogiques utilisent un modèle OpenAI. Les fournisseurs, modèles, prompts, mécanismes de recherche et éventuels contrôles croisés restent inconnus.

## Lecture produit — interprétation

Le point fort observable est l'entrée unifiée : l'utilisateur choisit ce qu'il veut produire, puis apporte une question ou un support. Les exemples rendent chaque résultat attendu concret avant la connexion.

La navigation offre de nombreux modules, parfois proches : les outils d'étude existent à la fois dans l'accueil et dans AI Study. Cela peut faciliter la découverte, mais aussi compliquer le choix ; il s'agit d'une appréciation ergonomique, sans test utilisateur.

La demande de connexion après saisie constitue une étape de conversion tardive. Son effet réel sur l'abandon ne peut pas être déduit de cette observation.

Si cette analyse sert de référence pour Nésalio, les pistes les plus directement exploitables seraient une saisie centrale avec import de documents, des modes explicites « Expliquer / Réviser / S'entraîner », des exemples de résultats et un parcours cohérent de progression. Ce sont des propositions de conception, pas des fonctions ajoutées au projet.

## Couverture et inconnues

- Identité de la cible et redirection : vérifiées.
- Navigation et formulaires des principaux modes : vérifiés.
- Career Hub, AI Live Notes et AI Study : interfaces inspectées, traitements non exercés.
- Parcours Solver : vérifié jusqu'à la demande de connexion.
- Technologies : indices client et réseau observés, architecture serveur inconnue.
- Tarifs et quotas : non établis.
- Qualité des réponses, transcription, détection IA, plagiat : non évalués.
- Sécurité, conformité, stockage des documents et politique de rétention : non audités.
- Performance : aucun benchmark. La capture réseau initiale contient des requêtes encore en cours à sa clôture ; elle n'est pas un inventaire exhaustif de toute l'activité.
- Apparence visuelle et responsive mobile : non évalués par captures d'écran ; analyse fondée sur le DOM, l'accessibilité et les actions déclarées.

Sources directes : https://solvely.ai/home, https://solvely.ai/quiz/home, https://solvely.ai/home/ai-interview, https://solvely.ai/home/ai-note.
