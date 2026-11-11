# Audit de la caméra (leçons enregistrées, voix simulée)

**Score d'inconfort moyen : 2.98 par minute** (mouvement 2.90, lisibilité 0.08) — plus bas = mieux.
Mouvements par minute : 1.61 ; écrans parcourus par minute : 0.39 ; aller-retours : 17 ; sauts sans transition : 0 ; mouvements rapides : 2.
Origine des mouvements : ordres du JSON (camera.focus/restore) 144 ; suivi automatique du moteur 664 ; plage d'un paramètre 0.

**Composition** (images immobiles) : remplissage moyen 62 % ; écran trop vide (< 45 %, caméra reculée) 0.2 % du temps ; contenu décentré (> 20 % d'écran) 7.3 % du temps.

Qui a cadré l'image trop vide : follow 46 s ; json_focus 14 s ; décentrée : follow 1163 s ; depart 524 s ; json_focus 446 s.

Leçons jouées : 251 ; invalides ou en erreur : 2.

| Défaut | Leçons touchées | Durée totale |
| --- | --- | --- |
| Objet coupé par le bord du cadre | 18/251 | 309 s |
| Geste sur un objet hors champ | 7/251 | — |
| Écran vide alors que le tableau ne l'est pas | 5/251 | 12 s |
| Caméra sous le zoom lisible (0,6) | 0/251 | 0 s |

## Les leçons les plus touchées

| Leçon | Durée | Coupé | Hors champ | Vide | Trop petit | Zoom min |
| --- | --- | --- | --- | --- | --- | --- |
| banc/ap3-relecteur/ap-correlation-force-t1.json | 171 s | 69.2 s (axes1, bareme) | — | 0 s | 0 s | 0.68 |
| banc/ap3n-relecteur/ap3-vecteurs-polaires-t1.json | 134 s | 57.5 s (rep, v1) | — | 0 s | 0 s | 0.61 |
| banc/ap2-allegees/ap-polygone-contraintes-t1.json | 148 s | 30.5 s (axes) | poly | 0 s | 0 s | 0.6 |
| banc/ap2-allegees/ap-polygone-contraintes-t2.json | 167 s | 22.3 s (rep, cote_int) | sB | 0 s | 0 s | 0.6 |
| banc/ap3n-sans/ap3-gaz-boyle-pression-diminue-t1.json | 124 s | 24.1 s (piston) | — | 0 s | 0 s | 0.67 |
| banc/ap2-allegees/ap-gaz-pressions-partielles-t2.json | 117 s | 7.5 s (tab) | — | 4.1 s | 0 s | 0.72 |
| banc/ap2-allegees/ap-correlation-force-t2.json | 118 s | 15.2 s (nuage, droite, lab_x) | — | 0 s | 0 s | 0.63 |
| banc/ap3-relecteur/ap-correlation-tableau-t1.json | 185 s | 15.1 s (axes_tableau) | — | 0 s | 0 s | 0.61 |
| banc/ap2-allegees/ap-complexe-active-t2.json | 130 s | 0 s () | lbl_ca | 3.1 s | 0 s | 0.61 |
| banc/coupees-apres/ap-gaz-ballons-helium-t1.json | 166 s | 14.1 s (division, reponse) | — | 0 s | 0 s | 0.82 |
| banc/ap2-allegees/ap-trigo-rectangle-t2.json | 126 s | 12.1 s (rep) | — | 0 s | 0 s | 0.62 |
| banc/ap3n-relecteur/ap3-loi-cosinus-obtus-t1.json | 206 s | 11.7 s (segAB, segBC) | — | 0 s | 0 s | 0.8 |
| banc/ap2-allegees/ap-complexe-active-t1.json | 130 s | 10 s (instable) | — | 0 s | 0 s | 0.65 |
| banc/ap2-allegees/ap-inequation-valeur-absolue-t2.json | 151 s | 0 s () | — | 2.3 s | 0 s | 0.9 |
| banc/ap3-relecteur/ap-gaz-volume-so2-t1.json | 118 s | 6.5 s (calcul_M) | — | 0 s | 0 s | 0.97 |
| banc/ap3n-relecteur/ap3-fes2-o2-moles-t1.json | 130 s | 0 s () | — | 1.8 s | 0 s | 0.88 |
| banc/ap2-allegees/ap-correlation-tableau-t2.json | 195 s | 0 s () | rect | 0 s | 0 s | 0.68 |
| banc/ap3-relecteur/ap-titrage-yamaska-t1.json | 210 s | 0 s () | test | 0 s | 0 s | 0.93 |
| banc/coupees-apres/ap-co2-ionique-t1.json | 145 s | 0 s () | regle_ion | 0 s | 0 s | 0.94 |
| lecons-jouees/2026-11-10T17-20-17-reactif_limitant.json | 92 s | 0 s () | eq | 0 s | 0 s | 0.95 |
| banc/ap2-allegees/ap-masse-moles-t1.json | 127 s | 4.5 s (atomes) | — | 0 s | 0 s | 0.93 |
| banc/ap3n-relecteur/ap3-sinus-domaine-t1.json | 132 s | 3.4 s (tab) | — | 0 s | 0 s | 0.63 |
| banc/ap2-allegees/ap-conductibilite-ph-t2.json | 138 s | 3.1 s (na_ion) | — | 0 s | 0 s | 0.91 |
| banc/ap3n-sans/ap3-gaz-charles-seringue-t1.json | 139 s | 0 s () | — | 0.9 s | 0 s | 0.87 |
| banc/ap2-allegees/ap-pente-un-point-t2.json | 81 s | 1.3 s (rep) | — | 0 s | 0 s | 0.73 |
| banc/ap3n-sans/ap3-masse-molaire-coefficients-t1.json | 111 s | 0.4 s (calc) | — | 0 s | 0 s | 0.92 |
| banc/ap2-allegees/ap-acide-base-sel-t1.json | 149 s | 0 s () | — | 0 s | 0 s | 0.96 |
| banc/ap2-allegees/ap-acide-base-sel-t2.json | 106 s | 0 s () | — | 0 s | 0 s | 0.94 |
| banc/ap2-allegees/ap-bicarbonate-vinaigre-t1.json | 104 s | 0 s () | — | 0 s | 0 s | 0.98 |
| banc/ap2-allegees/ap-bicarbonate-vinaigre-t2.json | 122 s | 0 s () | — | 0 s | 0 s | 0.96 |

## Invalides ou en erreur

- banc/ap3-relecteur/ap-proba-conditionnelle-venn-t1.json : Error: Le groupe détacherait « l1 » de son parent.
- banc/coupees-apres/ap-trois-pieces-t2.json : Error: Le groupe détacherait « abc_lab » de son parent.