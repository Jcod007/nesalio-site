# Nesalio — choix du moteur de circuits numériques (évaluation technique)

## Objectif réel

À partir d'une question de l'étudiant, Nesa doit **créer un circuit inédit**, faire apparaître ses composants progressivement, simuler de manière fiable les signaux et expliquer oralement les transitions. L'étudiant ne doit pas être obligé de dessiner le circuit. La simulation doit être indépendante de l'IA.

## Candidats vérifiés

| Candidat | Forces observées | Limites / travail restant |
| --- | --- | --- |
| DigitalJS + yosys2digitaljs + Yosys | DigitalJS simule des netlists numériques issues de Yosys ; JSON, visualisation et simulateur JavaScript ; synthèse Verilog vers circuit | Vérifier précisément les cellules D/T/JK/SR, reset synchrone/asynchrone, bus et états inconnus ; adapter les données au tableau pédagogique |
| CircuitVerse | Simulateur événementiel avec horloge, testbench, chronogrammes, sous-circuits | Le moteur est lié à une application et un éditeur complets ; coût d'extraction/intégration à mesurer |
| Simulateur maison TypeScript (PR #19) | Contrôle complet de l'API et de la sémantique | Trop immature pour être le moteur scientifique principal sans vérification indépendante |
| Manim Web | Déjà intégré dans Nesalio ; dessin et animation de scènes | Pas un moteur de simulation de circuits ; doit consommer les événements du simulateur |

Sources : https://github.com/tilk/digitaljs ; https://simulator-docs.circuitverse.org/engine.js.html ; https://github.com/SouparnaChatterjee/POC_Task_Project7

## Décision provisoire

**Tester d'abord DigitalJS + Yosys** dans un prototype isolé, sans remplacer le tableau existant ni fusionner PR #19. Garder le schéma métier indépendant du fournisseur. Évaluer CircuitVerse en second si DigitalJS ne satisfait pas les cas séquentiels.

Pipeline cible :
1. DeepSeek propose un circuit structuré (composants, ports, fils, valeurs initiales, horloge, objectifs pédagogiques).
2. Zod valide la forme, puis un validateur sémantique vérifie largeur de bus, drivers, cycles et paramètres.
3. Un adaptateur compile vers une netlist DigitalJS ou vers Verilog/Yosys, selon la couverture requise.
4. Le simulateur produit des **événements horodatés** : entrée modifiée, front d'horloge, sortie modifiée, reset, erreur.
5. Le moteur pédagogique crée une chronologie unique des événements, de la narration et des actions du tableau.
6. Manim Web affiche le circuit et ses changements ; la synthèse vocale suit la même chronologie.

## Tests d'acceptation indispensables avant intégration

- Tables de vérité exhaustives des portes et comparateurs, encodeurs/décodeurs et multiplexeurs (petites largeurs).
- Bus de 1, 4, 8 et 16 bits ; propagation et largeur des connexions.
- Bascule D : échantillonnage uniquement au front actif, maintien entre fronts.
- Bascule T : maintien pour T=0 et bascule pour T=1.
- Bascule JK : maintien, set, reset et toggle.
- Reset **asynchrone** : effet immédiat, même sans front d'horloge.
- Reset **synchrone** : effet seulement au front d'horloge.
- Horloges, cascades de bascules, compteurs et sous-circuits.
- États invalides, entrées flottantes et conflits de drivers : erreurs explicites ou états X/Z selon les conventions retenues.
- Comparaison avec un simulateur de référence (p. ex. Icarus Verilog) sur les mêmes vecteurs de test.
- Génération de 20 circuits par IA, validation, simulation et contrôle des explications (l'IA ne fournit jamais les sorties de référence).
- Synchronisation narration ↔ animation ↔ signal ; pause/reprise et interruption.
- Exécution sans code arbitraire généré par l'IA ; compilation isolée avec limites de ressources.

## Critère de sortie

Ne pas déclarer le moteur « prêt pour les examens » sans résultats de tests exécutés, reproductibles et traçables. Le moteur TypeScript de PR #19 est un **prototype initial**, non une référence scientifique validée.
