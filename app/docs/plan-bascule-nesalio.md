# Plan : brancher Nesalio dans la page élève

Statut : **validé par l'utilisateur le 2026-11-08** (réponses en fin de document).

Décisions de l'utilisateur :
1. Boutons des points 3 et 5 : oui, tels quels (avec « Revoir l'explication »).
2. « Attends, je comprends pas » : retiré tant que le tuteur n'existe pas.
3. Téléphone : accepté tel quel pour l'instant ; vérifier ce que ça donne, cadrage plus tard.
4. Par défaut : Nesalio, avec l'ancien système en secours par un réglage.

## But

L'élève pose une question (écrite ou dite) ; Nesa l'explique au tableau avec sa voix,
au format Nesalio. Pas de tuteur pour l'instant : pas de questions à l'élève, pas de
diagnostic, pas de bilan. Le tuteur viendra plus tard.

## Ce que fait la page élève aujourd'hui (ancien système)

- Écran d'accueil : champ de question, micro, trois questions à essayer, mentions son et confidentialité.
- Pendant l'explication, la carte de Nesa (en bas) : sous-titre, « Attends, je comprends pas » (interrompt),
  micro, saisie d'une question pendant la pause, « Continuer l'explication ».
- Questions à choix, réponse avec ses mots, « Montre-moi d'abord » (tuteur).
- Fin : point d'étape, « Ce que j'ai remarqué », autre question, « Continuer avec Nesa », « Nouvelle notion ».
- Barre du haut : titre, son coupé, retour à l'accueil, bouton d'avis (Feedback).
- Après la séance : questions « après essai » (formulaire d'avis).
- Mode démonstration sans IA (leçons écrites à l'avance), mode inspection JSON (développeurs).

## Ce que le lecteur Nesalio sait faire, et ce qui manque

| Besoin | Lecteur Nesalio aujourd'hui |
| --- | --- |
| Jouer une leçon en flux, voix synchronisée | Oui |
| Arrêter (nouvelle question, retour à l'accueil) | Oui (abandon) |
| Couper le son | **Non** — à ajouter (voix muette, gestes à l'heure) |
| Pause / reprise | **Non** — à ajouter (voix et silences entre passages) |
| Sous-titre dans la carte de Nesa | Le texte est disponible (`beat.say`), à brancher |
| Écran de téléphone (format portrait) | **Non** — cadrage pensé pour un écran large (chantier 5.4 mis de côté) |
| Mode démonstration sans IA | Non — Nesalio a besoin du modèle |

## Proposition

1. **Un interrupteur** (variable d'environnement, ex. `NESALIO_EXPLICATION=1`) choisit l'ancien système
   ou Nesalio pour l'explication. Défaut : ancien système tant que l'utilisateur n'a pas validé.
   Revenir en arrière = changer la variable, sans toucher au code. L'ancien code reste.
2. **Même écran d'accueil**, textes ajustés : plus de promesse « tu peux l'interrompre » tant que
   l'interruption n'existe pas.
3. **Pendant l'explication** (carte de Nesa) : sous-titre de la phrase dite, « Pause » / « Reprendre »,
   son coupé (barre du haut), « Nouvelle question » (arrête et revient à l'accueil).
   Le micro pendant l'explication sert à poser une autre question (arrête l'explication en cours).
4. **Pendant la préparation** (3 à 7 s avant le premier son) : Nesa « prépare l'explication » avec
   l'animation d'attente ; puis « Nesa écrit la suite… » si une tranche tarde.
5. **À la fin** : « Explication terminée », champ « Une autre question ? », « Revoir l'explication »
   (rejoue la même leçon sans appel au modèle), « Nouvelle notion ». Le formulaire « après essai » et le
   bouton d'avis restent.
6. **Erreurs** : modèle indisponible ou leçon impossible → message de Nesa + « Réessayer » / « Autre
   question ». Voix en panne → la leçon continue en sous-titres (déjà prévu par le lecteur).
   Arrêt en cours de route → ce qui a été joué reste au tableau, avec un message.
7. **Sans IA** (`DISABLE_AI`, mode démo) : l'ancien système et ses leçons de démonstration restent utilisés.
8. **Inspection JSON** : reste sur l'ancien système (outil de développement) ; `/dev/nesalio` sert pour Nesalio.

## Vérification prévue

- Tests : interrupteur (ancien / Nesalio), pause et reprise (voix et silences), son coupé, arrêt,
  rejouer, chaque cas d'erreur ; suite complète et `tsc`.
- Navigateur, comme un élève : questions écrites et dites, pause, son, nouvelle question pendant
  l'explication, erreur simulée, fin et « Revoir » ; avec l'interrupteur coupé, l'ancien parcours intact.
- Téléphone : vérifier ce que donne le tableau en portrait (voir décision 3).

## Décisions demandées à l'utilisateur

1. La liste des boutons pendant et après l'explication (points 3 et 5) vous convient-elle ?
2. « Attends, je comprends pas » : retirer tant que le tuteur n'existe pas (proposé), ou le garder pour
   « arrêter et poser une autre question » ?
3. Téléphone : accepter un tableau moins bien cadré en portrait pour l'instant, ou faire le cadrage
   téléphone (chantier 5.4) avant la bascule ?
4. Une fois validé à l'écran : basculer par défaut sur Nesalio, ou garder l'ancien par défaut quelque temps ?
