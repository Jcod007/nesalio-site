# Audit de la caméra (leçons enregistrées, voix simulée)

**Score d'inconfort moyen : 7.67 par minute** (mouvement 7.37, lisibilité 0.30) — plus bas = mieux.
Mouvements par minute : 2.12 ; écrans parcourus par minute : 0.55 ; aller-retours : 35 ; sauts sans transition : 0 ; mouvements rapides : 493.
Origine des mouvements : ordres du JSON (camera.focus/restore) 146 ; suivi automatique du moteur 890 ; plage d'un paramètre 0.

Leçons jouées : 238 ; invalides ou en erreur : 2.

| Défaut | Leçons touchées | Durée totale |
| --- | --- | --- |
| Objet coupé par le bord du cadre | 38/238 | 956 s |
| Geste sur un objet hors champ | 7/238 | — |
| Écran vide alors que le tableau ne l'est pas | 17/238 | 110 s |
| Caméra sous le zoom lisible (0,6) | 1/238 | 30 s |

## Les leçons les plus touchées

| Leçon | Durée | Coupé | Hors champ | Vide | Trop petit | Zoom min |
| --- | --- | --- | --- | --- | --- | --- |
| banc/ap3-relecteur/ap-correlation-force-t1.json | 171 s | 102.8 s (axes1, rect, axes2, axes3) | — | 0 s | 0 s | 0.64 |
| banc/ap3n-relecteur/ap3-loi-cosinus-obtus-t1.json | 206 s | 64.5 s (segAC, segBC) | pA, labA, labB, segAB, labAB, labAC, labAngA | 0 s | 0 s | 0.6 |
| banc/ap3n-relecteur/ap3-optimisation-constante-t1.json | 108 s | 57.3 s (plan, droite) | — | 0 s | 29.8 s | 0.48 |
| banc/ap3n-relecteur/ap3-racine-croissance-t1.json | 112 s | 54.7 s (note, rep, axe) | — | 2.3 s | 0 s | 0.62 |
| banc/coupees-apres/ap-gaz-ballons-helium-t2.json | 186 s | 1.8 s (tab) | — | 19.7 s | 0 s | 1 |
| banc/ap3n-relecteur/ap3-vecteurs-polaires-t1.json | 134 s | 58.7 s (rep) | — | 0 s | 0 s | 0.61 |
| banc/ap2-allegees/ap-polygone-contraintes-t1.json | 148 s | 35.7 s (axes, front1) | poly, s1, s2 | 0 s | 0 s | 0.6 |
| banc/ap3n-sans/ap3-vecteurs-polaires-t1.json | 106 s | 50 s (rep, coord1, somme) | — | 0 s | 0 s | 0.62 |
| banc/ap2-allegees/ap-correlation-tableau-t1.json | 86 s | 44.6 s (rep1, rep2) | r1 | 0 s | 0 s | 0.68 |
| banc/ap3n-relecteur/ap3-gaz-volume-molaire-caracteristique-t1.json | 125 s | 49 s (hyp, nuance) | — | 0 s | 0 s | 0.6 |
| banc/ap2-allegees/ap-gaz-volume-so2-t1.json | 117 s | 45.7 s (masse) | — | 0 s | 0 s | 1 |
| banc/ap3n-sans/ap3-racine-croissance-t1.json | 117 s | 45.4 s (rep) | — | 0 s | 0 s | 0.7 |
| banc/ap3n-sans/ap3-gaz-ambulance-o2-t1.json | 111 s | 42.6 s (prop) | — | 0 s | 0 s | 1 |
| banc/coupees-apres/ap-gaz-pression-variations-t1.json | 282 s | 0 s () | — | 11.6 s | 0 s | 1 |
| banc/ap3-relecteur/ap-vitesse-ordre-2-t1.json | 94 s | 32.2 s (donnees) | — | 0 s | 0 s | 1 |
| banc/coupees-apres-nouvelles/ap3-grammes-reactif-non-limitant-t2.json | 123 s | 0 s () | — | 9.7 s | 0 s | 1 |
| banc/ap3-relecteur/ap-complexe-active-t1.json | 162 s | 24.3 s (eq3, axes_E) | — | 0 s | 0 s | 0.6 |
| banc/ap3n-sans/ap3-gaz-charles-seringue-t1.json | 139 s | 0 s () | — | 8.1 s | 0 s | 0.99 |
| banc/ap2-allegees/ap-gaz-pression-variations-t2.json | 186 s | 0 s () | — | 7.9 s | 0 s | 0.83 |
| banc/ap2-allegees/ap-isoler-temperature-t2.json | 198 s | 0 s () | — | 7.7 s | 0 s | 1 |
| banc/ap2-allegees/ap-polygone-contraintes-t2.json | 167 s | 18 s (rep, cote_int) | sB | 0 s | 0 s | 0.75 |
| banc/ap2-allegees/ap-inequation-valeur-absolue-t1.json | 134 s | 22 s (droite) | — | 0 s | 0 s | 0.78 |
| banc/ap3-relecteur/ap-endo-exo-t1.json | 64 s | 21.5 s (ax) | — | 0 s | 0 s | 0.84 |
| banc/ap2-allegees/ap-gaz-pressions-partielles-t1.json | 120 s | 0 s () | — | 7 s | 0 s | 0.99 |
| banc/ap3-relecteur/ap-zinc-hcl-t1.json | 81 s | 0 s () | — | 6.9 s | 0 s | 0.79 |
| banc/coupees-apres/ap-parabole-foyer-t1.json | 122 s | 20.2 s (axe, ecart, dir, courbe) | — | 0 s | 0 s | 0.75 |
| banc/ap3-relecteur/ap-ppm-mol-t1.json | 96 s | 0 s () | — | 5.9 s | 0 s | 1 |
| banc/ap2-allegees/ap-complexe-active-t2.json | 130 s | 0 s () | lbl_ca | 4 s | 0 s | 0.62 |
| banc/ap2-allegees/ap-complexe-active-t1.json | 130 s | 16.8 s (montee, descente, fleche_ea) | — | 0 s | 0 s | 0.69 |
| banc/ap3n-sans/ap3-grammes-reactif-non-limitant-t1.json | 110 s | 16.7 s (eq) | — | 0 s | 0 s | 0.98 |

## Invalides ou en erreur

- banc/ap3-relecteur/ap-proba-conditionnelle-venn-t1.json : Error: Le groupe détacherait « l1 » de son parent.
- banc/coupees-apres/ap-trois-pieces-t2.json : Error: Le groupe détacherait « abc_lab » de son parent.