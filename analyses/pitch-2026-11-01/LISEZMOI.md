# Capture pour le pitch — 1er novembre 2026

Livrable : `nesalio-pitch-compte-demo.png` (1280 × 720, PNG).

La partie tutorat réutilise les composants de l'application : ManimBoard,
DiagnosticTag, TopBar et Dock. Le graphique et les calculs proviennent des dix
premières étapes de `app/src/content/demoLessons.ts` (quadraticLesson).
L'image fige un moment de cette démonstration pour obtenir un résultat reproductible.
Le sous-titre rassemble les deux phrases correspondantes de la séance.

La colonne de compte est une proposition pour le pitch. Léa est un profil fictif.
Mes séances, Mes progrès et Mon compte sont des éléments de maquette : aucune
authentification, inscription ou sauvegarde de progression n'a été ajoutée au produit.
Le site et l'application en production n'ont pas été modifiés pour cette capture.

Pour recréer l'aperçu local :

1. Copier `page.tsx` et `PitchFrame.tsx` dans `app/src/app/pitch/`.
2. Garder ce dossier d'artefacts à sa place actuelle (la page lit `capture.html`).
3. Lancer `npm run dev` depuis `app/`, puis ouvrir `http://localhost:3000/pitch`.
4. Prendre la capture une fois le tableau chargé. Retirer ensuite les deux fichiers
   temporaires de `app/src/app/pitch/`.

La route d'aperçu répond uniquement en mode développement. Ces sources sont
conservées dans les analyses, hors de la route de l'application.
