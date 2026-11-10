# Audit de la caméra (leçons enregistrées, voix simulée)

**Score d'inconfort moyen : 3.44 par minute** (mouvement 3.35, lisibilité 0.09) — plus bas = mieux.
Mouvements par minute : 1.52 ; écrans parcourus par minute : 0.43 ; aller-retours : 17 ; sauts sans transition : 0 ; mouvements rapides : 20.
Origine des mouvements : ordres du JSON (camera.focus/restore) 115 ; suivi automatique du moteur 624 ; plage d'un paramètre 0.

Leçons jouées : 238 ; invalides ou en erreur : 2.

| Défaut | Leçons touchées | Durée totale |
| --- | --- | --- |
| Objet coupé par le bord du cadre | 20/238 | 356 s |
| Geste sur un objet hors champ | 4/238 | — |
| Écran vide alors que le tableau ne l'est pas | 4/238 | 10 s |
| Caméra sous le zoom lisible (0,6) | 0/238 | 0 s |

## Les leçons les plus touchées

| Leçon | Durée | Coupé | Hors champ | Vide | Trop petit | Zoom min |
| --- | --- | --- | --- | --- | --- | --- |
| banc/ap3n-relecteur/ap3-vecteurs-polaires-t1.json | 134 s | 56.8 s (rep) | — | 0 s | 0 s | 0.61 |
| banc/ap3n-relecteur/ap3-gaz-volume-molaire-caracteristique-t1.json | 125 s | 48.5 s (hyp, nuance) | — | 0 s | 0 s | 0.6 |
| banc/ap2-allegees/ap-correlation-force-t2.json | 118 s | 36.2 s (nuage, droite) | — | 0 s | 0 s | 0.62 |
| banc/ap3-relecteur/ap-correlation-force-t1.json | 171 s | 30.4 s (axes1) | — | 0 s | 0 s | 0.64 |
| banc/ap2-allegees/ap-complexe-active-t1.json | 130 s | 27.9 s (instable, montee, descente, fleche_ea) | — | 0 s | 0 s | 0.69 |
| banc/ap2-allegees/ap-polygone-contraintes-t1.json | 148 s | 23.2 s (axes, front1) | — | 0 s | 0 s | 0.6 |
| banc/coupees-apres/ap-parabole-foyer-t1.json | 122 s | 22.3 s (axe, ecart, dir) | — | 0 s | 0 s | 0.66 |
| banc/ap2-allegees/ap-mediane-t2.json | 118 s | 20.6 s (nl2) | — | 0 s | 0 s | 0.92 |
| banc/ap2-allegees/ap-polygone-contraintes-t2.json | 167 s | 15.4 s (rep, cote_int) | sB | 0 s | 0 s | 0.75 |
| banc/ap3-relecteur/ap-correlation-tableau-t1.json | 185 s | 14.8 s (axes_tableau) | — | 0 s | 0 s | 0.61 |
| banc/coupees-apres/ap-gaz-ballons-helium-t1.json | 166 s | 14.5 s (etat2, division) | — | 0 s | 0 s | 0.8 |
| banc/ap2-allegees/ap-gaz-pressions-partielles-t2.json | 117 s | 0 s () | — | 4.1 s | 0 s | 0.89 |
| banc/ap2-allegees/ap-inequation-valeur-absolue-t1.json | 134 s | 11.9 s (droite) | — | 0 s | 0 s | 0.78 |
| banc/ap3n-relecteur/ap3-loi-cosinus-obtus-t1.json | 206 s | 11.2 s (segAC, segBC) | — | 0 s | 0 s | 0.81 |
| banc/ap2-allegees/ap-correlation-tableau-t2.json | 195 s | 0 s () | rect, rule | 0 s | 0 s | 0.68 |
| banc/ap2-allegees/ap-sinus-cosinus-t1.json | 86 s | 9.5 s (rep) | — | 0 s | 0 s | 1 |
| banc/ap2-allegees/ap-inequation-valeur-absolue-t2.json | 151 s | 0 s () | — | 2.7 s | 0 s | 0.99 |
| banc/ap3n-relecteur/ap3-fes2-o2-moles-t1.json | 130 s | 0 s () | — | 1.8 s | 0 s | 0.93 |
| banc/ap2-allegees/ap-complexe-active-t2.json | 130 s | 0 s () | lbl_ca | 0 s | 0 s | 0.62 |
| banc/ap3-relecteur/ap-titrage-yamaska-t1.json | 210 s | 0 s () | test | 0 s | 0 s | 1 |
| banc/coupees-apres-nouvelles/ap3-sinus-domaine-t2.json | 143 s | 4.3 s (dom) | — | 0 s | 0 s | 0.6 |
| banc/ap2-allegees/ap-gaz-theorie-cinetique-t2.json | 161 s | 4 s (explication) | — | 0 s | 0 s | 0.61 |
| banc/ap3n-sans/ap3-gaz-charles-seringue-t1.json | 139 s | 0 s () | — | 0.9 s | 0 s | 1 |
| banc/ap2-allegees/ap-conductibilite-ph-t2.json | 138 s | 2.3 s (na_ion) | — | 0 s | 0 s | 0.94 |
| banc/ap2-allegees/ap-pente-un-point-t2.json | 81 s | 1.3 s (rep) | — | 0 s | 0 s | 0.73 |
| banc/ap2-allegees/ap-correlation-force-t1.json | 92 s | 0.8 s (axes1, axes2) | — | 0 s | 0 s | 0.61 |
| banc/ap3n-sans/ap3-gaz-boyle-pression-diminue-t1.json | 124 s | 0.4 s (exemple) | — | 0 s | 0 s | 0.62 |
| banc/ap2-allegees/ap-acide-base-sel-t1.json | 149 s | 0 s () | — | 0 s | 0 s | 0.96 |
| banc/ap2-allegees/ap-acide-base-sel-t2.json | 106 s | 0 s () | — | 0 s | 0 s | 0.88 |
| banc/ap2-allegees/ap-bicarbonate-vinaigre-t1.json | 104 s | 0 s () | — | 0 s | 0 s | 1 |

## Invalides ou en erreur

- banc/ap3-relecteur/ap-proba-conditionnelle-venn-t1.json : Error: Le groupe détacherait « l1 » de son parent.
- banc/coupees-apres/ap-trois-pieces-t2.json : Error: Le groupe détacherait « abc_lab » de son parent.