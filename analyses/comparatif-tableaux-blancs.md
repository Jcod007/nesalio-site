# Comparaison des tableaux blancs Nésalio et Solvely

État au 27 octobre 2026 : deux essais Nésalio exécutés ; leçon réelle Solvely inspectée après connexion, avec captures visuelles et examen du bundle livré au navigateur. Comparaison fonctionnelle établie ; benchmark de performance et tests d'interruption symétriques non réalisés.

## Périmètre

Comparer uniquement la fonction de tutorat sur tableau blanc. Les autres fonctions de Solvely, sa popularité et les avis sur la facturation ne déterminent pas la note du tableau blanc.

La cible Nésalio retrouvée dans les fichiers du dépôt est https://nesalio-app.vercel.app/. L'adresse app.nesalio.com du README n'a pas permis une navigation réussie lors du premier essai. Le dépôt est https://github.com/Jcod007/nesalio-site. Une mise à jour git pull --ff-only a récupéré 10 commits, de a135625 à fe5a1315cc79376835603ea2759c9fb46cb2f9e5. GitHub signale le déploiement Vercel nesalio-app de ce dernier commit comme réussi. Cela relie le dépôt au déploiement ; aucun identifiant de build n'a été lu dans le navigateur pour vérifier l'identité exacte des octets servis.

## Grille proposée

| Critère | Poids | Vérification |
| --- | ---: | --- |
| Exactitude des objets et des calculs | 20 % | Coordonnées, échelles, formules et résultats conformes aux valeurs attendues ; absence de contradictions entre voix et dessin |
| Qualité de l'explication | 20 % | Étapes utiles, adaptation au niveau, vérification de compréhension, réaction à une erreur |
| Synchronisation voix et dessin | 15 % | Objet visible lorsqu'il est nommé, tracé progressif utile, absence de longues séquences parlées sans support |
| Contrôle et interaction de l'élève | 15 % | Interrompre, poser une question sur la figure, reprendre sans perdre le contexte ; distinguer tutorat et manipulation directe |
| Lisibilité et accessibilité | 10 % | Labels lisibles, absence de collisions, sous-titres, contraste, clavier, cadrage desktop et téléphone |
| Réactivité et stabilité | 10 % | Temps avant premier contenu utile, interruptions, fluidité, absence de blocage et comportement sur erreur |
| Supports d'entrée | 5 % | Texte, voix, image ou document réellement utilisables dans le tableau blanc |
| Continuité de la leçon | 5 % | Retour à une étape, conservation des explications, reprise et export si disponibles |

Notation : 0 absent ou échec observé ; 1 très insuffisant ; 2 limité ; 3 satisfaisant ; 4 solide ; 5 excellent. NV signifie non vérifié, jamais zéro par défaut. Les notes globales ne sont comparables que sur un périmètre effectivement testé des deux côtés. Les poids sont une proposition à ajuster selon l'objectif pédagogique.

## Exercices communs

1. **Quadratique.** « Explique à un élève du secondaire comment trouver les zéros de f(x) = x² − 4x + 3. Construis le graphique progressivement et pose-moi une question avant de donner la solution. » Attendus : racines 1 et 3, sommet (2, −1), ordonnée à l'origine 3, parabole ouverte vers le haut.
2. **Erreur et interruption.** Pendant le même exercice : « Attends, je ne comprends pas pourquoi le sommet est à x = 2. » Puis proposer « Je pense que les zéros sont −1 et −3. » Vérifier la réponse, la mise en évidence du bon objet et la reprise du cours.
3. **Vecteurs.** « Construis u = (3, 1) et v = (−1, 2), puis explique graphiquement u + v. Montre la méthode bout à bout. » Attendu : résultante (2, 3), translation correcte de v sans modification de ses composantes.
4. **Dérivée et tangente.** « Explique la dérivée de x² au point x = 1 avec une courbe et une tangente. » Attendus : point (1, 1), pente 2, tangente y = 2x − 1. Vérifier que le dessin illustre effectivement ces valeurs.

Pour chaque exercice : même texte, même langue, même appareil, même taille de fenêtre et mêmes réponses de l'élève. Noter navigateur, date, offre et version lorsque visibles. Une vidéo promotionnelle ou une séance de démonstration fixe ne remplace pas une leçon générée. Séparer temps de génération et qualité du rendu. Ne pas annoncer un FPS sans mesure.

## Éléments déjà établis

### Solvely

- Onglet Whiteboard Tutor accessible sur https://solvely.ai/home avec saisie de sujet, import de fichiers et d'images, bouton Start lesson.
- Le lancement d'une leçon dans une session invitée demande une connexion. La séance n'a pas été exécutée dans cette session.
- Les exemples de l'accueil sont des vidéos. L'exemple Guided problem solving utilise /whiteboard-tutor/lesson-previews/guided-problem-solving.mp4.
- Un photogramme de démonstration montre un espace de dessin à droite, un panneau Original materials à gauche et des contrôles en bas. Cela établit la présentation de l'exemple, pas le fonctionnement réel de chaque contrôle.
- Ces observations initiales ont ensuite été complétées par la leçon connectée décrite ci-dessous. Les bibliothèques chargées par l'ensemble du site ne suffisent pas à identifier le moteur du tableau ; le bundle WhiteboardTutorHost a été examiné séparément.

Preuves REA (identifiants de session, données intégrales non exportées) :

- Capture d'exemple : ev_bb097bac78d9675a79a1c427216cfc8ebd78666c6a7bf22218577f9f8b7bfa11.
- Lancement bloqué par connexion : ev_554b466f27ad08b62280c4b60ba76fe10f6612c80000330bf9a6cbd1034c9faa.
- DOM de la vidéo d'exemple : ev_9c64352072bb7223fd6e57a731eda6a894a9179c62fa3dfcd02b3da50046c7e3.

### Nésalio — référence source locale mise à jour

- Registre de 44 commandes de scène : objets et constructions mathématiques, transformations, surbrillance, caméra, courbes et calculs. Les ajouts récupérés incluent une fonction partie entière exacte et un modèle d'aire pour les polynômes.
- Rendu manim-web, placement automatique des textes et calculs, synchronisation planifiée avec la voix.
- Questions à l'élève, réponses texte/voix/QCM, interruption contextuelle et reprise.
- Zoom, déplacement et pincement du tableau. Aucun dessin libre ou déplacement direct d'objets par l'élève repéré dans l'UI inspectée.
- Solides affichés en projection 2D ; la commande image désigne une transformation géométrique, pas l'import d'un document.
- Points à tester : interruption effective des animations déjà planifiées, collisions sur scènes chargées, synchronisation réelle et lisibilité sur téléphone.
- Pas de contrôle de vitesse, timeline, export de cours ou reprise persistante par l'utilisateur repéré dans l'UI inspectée.

Références locales : app/src/domain/scene/commands/index.ts ; app/src/ui/board/manim/ManimRenderer.ts ; app/src/engine/player.ts ; app/src/ui/Dock.tsx ; app/src/ui/board/ManimBoard.tsx. Aucun test local exécuté pour cette analyse.

### Nésalio — essais réels sur le déploiement

Deux sessions Chrome distinctes, 1280 × 720, ont utilisé le premier exercice du protocole. Elles ne constituent ni un benchmark ni une évaluation statistique.

1. **Tracé initial.** Le navigateur affiche un repère et une parabole cohérente avec f(x) = x² − 4x + 3 : intersections visibles à x = 1 et x = 3, sommet (2, −1), ordonnée à l'origine 3. La légende et la phrase sur le signe positif du coefficient sont cohérentes. Aucun événement page-error capturé.
2. **Interruption puis erreur volontaire.** Le bouton d'interruption ouvre bien le champ « Dis-moi ce qui bloque… » et le bouton « Continuer l'explication ». La phrase « Je pense que les zéros sont −1 et −3 » est acceptée comme question contextuelle. Nésalio conserve la figure, ajoute le calcul f(−1) = 1 + 4 + 3 = 8 et le point (−1, 8), puis explique que −1 n'est pas un zéro. Ce calcul est correct. Aucun événement page-error capturé.
3. **Réserve visuelle observée.** Dans la seconde capture, le point (−1, 8) apparaît au-dessus du repère gradué et de la portion de courbe tracée. Le cadrage s'élargit et rend les petites écritures moins lisibles. Les coordonnées sont cohérentes, mais le lien visuel entre point et courbe gagnerait à être examiné sur la suite de la leçon.
4. **Non vérifié.** Ces captures ne prouvent pas le gel instantané des animations au clic, la synchronisation audio exacte, la reprise jusqu'à la fin, la correction de −3 ou les résultats des autres exercices. Les délais d'attente programmés dans le scénario ne sont pas des mesures de latence du modèle.

Preuves REA : accueil ev_208674217c9a50083ef9a5d0a7f0bf7759e1d3ae4fb46fe65b83aa9638d179cc ; tracé ev_84dcb70f5f4bdc74ec8338fc2c9863752bc3ac079b91a73ddc153968ee6492c4 ; interruption et correction ev_ee14bb2eabab92276e0919b8479301e97d88e9b47b3687ce04e48add38b11af4. Les deux essais ont terminé les navigateurs temporaires dont REA était propriétaire.

## Verdict

**Avantage Solvely sur la richesse fonctionnelle et les outils autour de la leçon. Aucun vainqueur établi sur la rapidité, la fluidité ou l'efficacité pédagogique globale.** Nésalio possède un moteur de constructions mathématiques spécialisé et une interaction contextuelle qui a fonctionné lors de l'essai. Cela ne prouve pas une supériorité sur le tableau Solvely.

### Leçon réelle Solvely

La leçon ouverte par l'utilisateur demande d'expliquer les zéros de f(x) = x² − 4x + 3 avec un graphique. C'est le même problème mathématique que l'essai Nésalio ; la consigne est plus courte, et les dimensions de fenêtre diffèrent. Il ne s'agit donc pas d'un protocole contrôlé identique.

- Les captures montrent un cours en français, structuré en titres, explications, équations, surlignage et graphique. Les zéros annoncés sont 1 et 3 ; les vérifications f(1) = 0 et f(3) = 0 sont correctes.
- La leçon présente ensuite un QCM de transfert : une fonction g coupe l'axe horizontal en (−2, 0) et (4, 0), et l'axe vertical en (0, −8). Les choix distinguent les abscisses des zéros de l'ordonnée à l'origine. La bonne réponse proposée est x = −2 et x = 4.
- Ce QCM établit la présence d'apprentissage actif. Aucune réponse n'a été envoyée au QCM pendant cette observation ; le retour correct/incorrect reste non testé.
- L'interface expose Pause/Resume lesson, Follow tutor, 1.0x Speed, Open transcript, Download lesson as PDF, Circle content for Tutor, Add attachment, Question or response et Send question.
- Le panneau Original materials reste disponible à côté du cours. Il indique des imports image, PDF, PowerPoint, Word et texte, ainsi qu'un bouton de fermeture. Aucun document personnel n'a été importé.
- La sélection d'une zone à expliquer est corroborée par le code du module ; elle n'a pas été exercée dans l'interface.
- Les changements Pause/Resume constatés entre captures ne sont pas attribués à une action automatique de l'agent. La commande d'interaction REA en connexion a échoué ; les observations passives ont fonctionné. Les blocages d'automatisation ne sont pas des défauts de Solvely.

Preuves : inspection retenue ev_db9cc6913ea291a14f2bc2cf1b659c10f44cc504c23416c5295299a31b21e55c ; première vue ev_b87fd616cf5bfa24bbc0d03156162e9e2478b14387754c49dfae5646f6d5099d ; contrôles ev_3eb8cfc7ee9c5d8117822305787c0f5fb3fcea1248169f28aa53d9d5a8cc9e28 ; contenu et QCM ev_e619b148bf08ed02a9f60871a72f97448c04c8a86a2bf3d62c69528f634c6b60 et capture visuelle ev_b69173d660bf5a173def0e730be4e3531a730a3ae5c9572bb6e749285655c05e.

### Comment Solvely construit son tableau

Le script livré WhiteboardTutorHost-CNynSdM9.js, capturé par REA, utilise un rendu hybride : texte structuré/Markdown, formules KaTeX, figures SVG et images, effets de tracé et de surlignage. Il prévoit aussi des objets geometry3d et des leçons HTML encapsulées, avec des chemins de génération tels que draw_p5 et draw_python_plot. Ces chemins présents dans le code n'établissent pas qu'ils ont tous été exécutés dans la leçon observée.

Le module contient une file audio, un suivi des sous-titres, une vitesse audio bornée de 0,5 à 2, des mécanismes pause/reprise, des annotations déclenchées avec les segments de narration, des checkpoints single_choice/free_text, la restauration de sessions/snapshots et un pipeline d'export PDF. Leurs résultats complets ne sont pas tous vérifiés en situation réelle.

Aucun moteur Manim n'a été identifié dans ce module. Cette recherche limitée ne prouve pas son absence dans tout le service. La différence établie est entre un tableau hybride orienté contenu de cours et le graphe de scène mathématique spécialisé de Nésalio ; elle ne constitue pas une mesure de performance.

### Comparaison par critère

| Critère | Nésalio | Solvely | Conclusion limitée aux preuves |
| --- | --- | --- | --- |
| Exactitude sur la quadratique | Courbe correcte ; f(−1) = 8 correct lors du suivi | Racines 1 et 3 et substitutions correctes | Les deux réussissent les éléments observés ; aucun taux de fiabilité global |
| Apprentissage actif | QCM et réponses libres dans le code ; question contextuelle testée | QCM de transfert observé ; choix et réponse libre dans le code | Présent des deux côtés ; qualité d'adaptation non départagée |
| Constructions mathématiques | 44 commandes, constructions et transformations, calculs géométriques spécialisés | Graphiques, SVG, images, chemins interactifs et objets 3D dans le code | Approches différentes ; aucun avantage de couverture ou d'exactitude générale prouvé |
| Voix et progression | Planification avec audio ; texte et dessins observés | Écriture progressive, sous-titres et file audio dans le code | Synchronisation précise non mesurée |
| Interruption/reprise | Interruption et question contextuelle exécutées | Contrôles et logique pause/reprise présents | Essai symétrique manquant ; ne pas attribuer de vainqueur |
| Vitesse de lecture | Aucun réglage utilisateur repéré | Contrôle visible, code audio 0,5–2x | Avantage fonctionnel Solvely ; changement de vitesse non testé |
| Sélection sur le dessin | Aucun outil élève de sélection d'objet/zone repéré | Circle content for Tutor et sélection Explain/Add to question dans le code | Avantage fonctionnel Solvely ; ce n'est pas la preuve d'une édition libre d'objets |
| Documents et référence | Entrée texte/voix ; pas d'import dans l'UI inspectée | Imports et panneau Original materials visibles | Avantage fonctionnel Solvely ; import non testé |
| Export et continuité | Pas d'export ni bibliothèque de cours utilisateur repérés | PDF/transcription visibles ; restauration et historique dans le code | Avantage fonctionnel Solvely ; PDF et restauration non validés bout en bout |
| Lisibilité | Graphique centré ; rétrécissement lors de l'ajout du point hors cadre dans l'essai | Cours plus dense ; panneau source refermable ; QCM superposé à la figure | Comparaison mobile et à dimensions égales manquante |
| Vitesse technique et stabilité | Pas de page-error dans les deux essais | Observation partielle d'une seule leçon | Pas de FPS, latence ou taux de panne comparables ; aucun classement |

### Priorités proposées pour Nésalio

1. Ajouter un outil pour désigner une zone ou un objet et demander « Explique ceci », en réutilisant les identifiants du graphe de scène.
2. Donner à l'élève une maîtrise du rythme : vitesse, pause effective de la voix ET des animations, puis navigation par étapes.
3. Exposer les explications sous forme consultable : transcription et export de séance ; ensuite reprise de cours enregistrés.
4. Ajouter les documents de cours et leur panneau de référence si l'usage cible inclut les devoirs photographiés ou les supports de classe.
5. Améliorer le cadrage des points hors du repère et préserver la taille des étiquettes ; fournir un accès clavier et une description sémantique des figures.

Ces propositions n'impliquent pas de remplacer manim-web. Les manques fonctionnels identifiés peuvent être traités autour du moteur actuel. Les modifications n'ont pas été implémentées dans cette analyse.

### Limites finales

Aucune note globale chiffrée n'est attribuée : les critères de synchronisation, performance, mobile et interruption n'ont pas reçu des tests identiques. Les essais vecteurs et tangente du protocole restent non exécutés. Les résultats PDF, imports, sélection visuelle et restauration de Solvely reposent sur interface/code et non sur une validation complète. L'absence d'un contrôle dans l'UI Nésalio inspectée ne prouve pas son absence dans toute branche du projet.

Une exportation locale des preuves a été conservée sous analyses/rea-private, répertoire ignoré par Git. Elle peut contenir des informations de session connectée et ne doit pas être publiée avec le rapport.
