# Fiches de Nesa à faire relire par un enseignant

**Pour qui :** un enseignant de mathématiques ou de chimie de secondaire 4-5 au Québec.

**De quoi il s'agit :** Nesa est un tuteur qui explique au tableau, avec une voix. Avant de répondre à un élève, il reçoit
la fiche de la notion concernée (parties A et B) et quelques faits sûrs (partie C). Il les prend pour vrais : une erreur
dans une fiche serait répétée à tous les élèves. Ces fiches ont été écrites et vérifiées par une IA, avec des sources
(Alloprof, manuels), mais elles n'ont jamais été relues par un enseignant.

**Ce qu'on vous demande :**
1. Chaque fait, chaque formule, chaque exemple chiffré est-il juste ?
2. Est-ce conforme à ce qui est enseigné au Québec en sec 4-5 (vocabulaire, notation, séquences CST / TS / SN, ST / STE, Chimie 5e) ?
3. Manque-t-il un piège classique ou une erreur fréquente des élèves ?

Notez simplement « OK », ou la correction, à côté de chaque ligne.

**À ignorer :** les lignes qui commencent par « Image : » et les mots techniques comme `matrix`, `function_graph`,
`highlight`, `label`. Ce sont des instructions de dessin pour le tableau, pas du contenu enseigné.

## Partie A — Chimie

### A1. Stœchiométrie (sec 4 STE)

- Idée centrale : les coefficients d'une équation balancée sont un rapport de MOLES, jamais de grammes. Chemin écrit au tableau : masse → quantité de matière (÷ M) → rapport des coefficients → quantité de matière → masse (× M).
- Exemple juste : 2 H₂ + O₂ → 2 H₂O avec 4 g de H₂ : n(H₂) = 4 ÷ 2,02 ≈ 1,98 mol ; rapport 2 : 2, donc n(H₂O) ≈ 1,98 mol ; m(H₂O) = 1,98 × 18,02 ≈ 35,68 g (garde 4 ÷ 2,02 entier dans la calculatrice). Contrôle par la conservation de la masse : il faut 0,99 mol de O₂, soit 31,68 g, et 4 + 31,68 = 35,68 g.
- Image : tableau de stœchiométrie (matrix, row_labels « coefficient », « quantité (mol) », « masse (g) », column_labels ["substance", "H₂", "O₂", "H₂O"]) : [[2, 1, 2], [1.98, "?", "?"], [4, "?", "?"]], chaque « ? » remplacé par sa valeur au fil du calcul (0,99 ; 1,98 ; 31,68 ; 35,68) ; highlight part « c3 » pour suivre l'eau. Chaque passage d'une ligne à l'autre = un label attaché (« ÷ 2,02 », « × 18,02 »).
- Réactif limitant : celui qui s'épuise le premier ; compare les quantités de matière divisées par leur coefficient. Exemple juste : \ce{N2 + 3H2 -> 2NH3} avec 2 mol de N₂ et 3 mol de H₂ : 2 ÷ 1 = 2 et 3 ÷ 3 = 1, donc H₂ est limitant ; n(NH₃) = 3 × 2/3 = 2 mol, calculé à partir du limitant seulement. Écris l'équation balancée avant de compter.
- La masse se conserve (mêmes atomes), pas le nombre de moles de molécules : dans 2 H₂ + O₂ → 2 H₂O, 3 mol de molécules deviennent 2 mol, parce que les mêmes atomes se regroupent en moins de molécules.

### A2. Gaz : lois des gaz (sec 5 Chimie)

- Températures en kelvins (T = θ + 273,15), pressions en kPa, volumes en L ; R = 8,314 kPa·L/(mol·K). Dis l'unité à voix haute. 1 atm = 101,3 kPa = 760 mm Hg.
- Lois simples (deux variables changent, les autres restent constantes) : Boyle-Mariotte p₁V₁ = p₂V₂ (n, T) ; Charles V₁/T₁ = V₂/T₂ (n, p) ; Gay-Lussac p₁/T₁ = p₂/T₂ (n, V) ; Avogadro V₁/n₁ = V₂/n₂ (p, T) ; p₁/n₁ = p₂/n₂ (V, T). Toutes sortent de la loi générale ; à p et V constants, elle donne n₁T₁ = n₂T₂ (n et T varient en sens inverse).
- Plusieurs changements à la fois : la loi générale, un facteur par variable. Volume triplé et température absolue doublée, n constant : p₂ = p₁ × (V₁/V₂) × (T₂/T₁) = p₁ × 1/3 × 2 = 2/3 p₁. Écris ce produit en une seule formule.
- Loi de Dalton : p(totale) = p(A) + p(B) + … ; la pression partielle d'un gaz est celle qu'il aurait seul dans le même volume, à la même température ; elle est déjà proportionnelle à ses moles : p(A) = n(A) ÷ n(total) × p(totale).
- Loi générale des gaz : p₁V₁ ÷ (n₁T₁) = p₂V₂ ÷ (n₂T₂) ; on raye ce qui reste constant. Loi de Boyle-Mariotte (n et T constants) : p₁V₁ = p₂V₂, la pression et le volume varient en sens INVERSE. Exemple juste : 100 kPa × 2,0 L = 250 kPa × V₂, V₂ = 0,80 L. L'erreur 2 × 250 ÷ 100 = 5 L inverse le rapport : comprimer ne peut pas agrandir le volume.
- Loi des gaz parfaits pV = nRT : n = pV ÷ (RT) = 101,3 × 5,0 ÷ (8,314 × 298,15) ≈ 0,204 mol (25 °C = 298,15 K). Volume molaire gazeux : 22,4 L/mol à TPN (0 °C, 101,3 kPa), 24,5 L/mol à TAPN (25 °C, 101,3 kPa). Loi de Dalton : la pression totale est la somme des pressions partielles. Hypothèse d'Avogadro : à même température et même pression, des volumes égaux de gaz contiennent le même nombre de particules. Théorie cinétique : la pression vient des chocs des particules sur la paroi.
- Image : Boyle-Mariotte = la courbe V = k ÷ p (function_graph "2/x", domain [0.4, 3.5] car 2 ÷ x n'existe pas en 0, la pression en centaines de kPa sur l'axe des x de 0 à 3,5, le volume en L de 0 à 5, axes nommés par label) avec les points (1 ; 2) et (2,5 ; 0,8) ; particules (point) dans un rectangle (polygon) qui rapetisse : mêmes points, moins de place.

### A3. Aspect énergétique des transformations (sec 4 ST et STE, sec 5 Chimie)

- Changements d'état (transformations PHYSIQUES : la substance reste la même) : fusion, vaporisation et sublimation absorbent de l'énergie, endothermiques (ΔH > 0) ; solidification (la congélation de l'eau), condensation liquide (liquéfaction) et condensation solide en dégagent, exothermiques (ΔH < 0). Vers un état plus désordonné, il faut fournir de l'énergie.
- Physique, chimique ou nucléaire : physique = même substance (changement d'état, dissolution) ; chimique = nouvelles substances (combustion, fermentation, oxydation) ; nucléaire = le noyau change (fission, fusion nucléaire, désintégration radioactive de l'uranium). Combustion et explosion : exothermiques.
- Reconnaître : énergie écrite du côté des réactifs, ou milieu qui se refroidit = endothermique ; énergie du côté des produits, chaleur ou lumière dégagée, milieu qui se réchauffe = exothermique. Complexe activé : l'état intermédiaire instable au sommet du diagramme, à l'énergie des réactifs plus l'énergie d'activation.
- Q = mcΔT (capacité thermique massique de l'eau c = 4,19 J/(g·°C)) : chauffer 200 g d'eau de 20 °C à 45 °C, ΔT = 25 °C, Q = 200 × 4,19 × 25 = 20 950 J ≈ 20,95 kJ. Dis quelle valeur de c tu prends (certains manuels : 4,18, donc 20 900 J).
- La température n'est pas la chaleur (ST) : la température mesure l'agitation des particules ; la chaleur est l'énergie transférée du corps chaud au corps froid.
- Réaction exothermique : elle dégage de l'énergie, ΔH < 0, les produits sont plus bas que les réactifs ; endothermique : ΔH > 0. ΔH = H(produits) − H(réactifs). Par les énergies de liaison : ΔH = Σ liaisons brisées − Σ liaisons formées (briser une liaison coûte de l'énergie, en former une en libère).
- Loi de Hess : on additionne les équations des étapes comme des égalités ; ce qui est des deux côtés s'annule (CO), et on additionne leurs ΔH : −110,5 + (−283,0) = −393,5 kJ pour \ce{C + O2 -> CO2}. Une équation inversée change le signe de son ΔH ; multipliée par 2, son ΔH aussi.
- Image : diagramme énergétique, axes nommés « progression de la réaction » et « énergie », en line : réactifs (0 ; 4)–(2 ; 4), montée (2 ; 4)–(3 ; 7), descente (3 ; 7)–(4 ; 1), produits (4 ; 1)–(6 ; 1). Arrow verticale de 4 à 7 = énergie d'activation ; arrow de 4 à 1 = ΔH (négatif : exothermique). Pour Hess, les deux équations empilées (math), le CO surligné des deux côtés puis estompé (dim) sur le mot « s'annule ».

### A4. Vitesse de réaction (sec 5 Chimie)

- Idée centrale (théorie des collisions) : une réaction se fait par des collisions efficaces, assez énergétiques (au moins l'énergie d'activation) et bien orientées. Chaque facteur change le nombre de collisions efficaces : nature des réactifs, concentration, surface de contact, température, catalyseur (il abaisse l'énergie d'activation sans changer ΔH).
- Loi des vitesses : v = k[A]ᵐ[B]ⁿ, exposants trouvés par l'expérience. Si v = k[A]², doubler [A] multiplie la vitesse par 4.
- La vitesse moyenne est un taux de variation : Δ(concentration) ÷ Δt, la pente d'une sécante sur la courbe concentration-temps.
- Image : particules (point) dans un rectangle (polygon), deux fois plus de points = plus de collisions ; ou le diagramme énergétique (line) avec un deuxième chemin plus bas pour le catalyseur, mêmes niveaux de départ et d'arrivée.

### A5. Équilibre chimique (sec 5 Chimie)

- Équilibre DYNAMIQUE : les réactions directe et inverse continuent à la même vitesse ; les concentrations restent constantes, elles ne sont pas égales.
- Constante d'équilibre : Kc = [produits]^coefficients ÷ [réactifs]^coefficients (solides et liquides purs exclus). Exemple juste : \ce{H2 + I2 <=> 2HI}, Kc = [HI]² ÷ ([H₂][I₂]) = 0,70² ÷ (0,10 × 0,10) = 0,49 ÷ 0,010 = 49. Kc > 1 : les produits sont favorisés. L'exposant 2 vient du coefficient 2 : surligne les deux en même temps.
- Même écriture pour les autres constantes : constante du produit de solubilité, \ce{AgCl(s) <=> Ag+ + Cl-} donne Kps = [Ag⁺][Cl⁻] (le solide n'y entre pas) ; constantes d'acidité et de basicité Ka et Kb ; Kw pour l'eau.
- Comparer des solubilités par les Kps : directement SEULEMENT entre sels qui libèrent le même nombre d'ions (même type : AgCl et BaSO₄, 1 : 1 ; Mg(OH)₂ et PbCl₂, 1 : 2) ; alors le plus grand Kps est le plus soluble. Sinon, calcule la solubilité molaire s : type 1 : 1, Kps = s² ; type 1 : 2, Kps = s × (2s)² = 4s³. Regarde d'abord le type des sels de l'élève et réponds pour SON cas.
- Principe de Le Chatelier : le système s'oppose à la perturbation. Ajout d'un réactif → déplacement vers les produits ; hausse de température → vers le côté endothermique ; hausse de pression → vers le côté qui a le moins de moles de gaz.
- Image : la formule de Kc en parts (une part par concentration) écrite sous l'équation (math, \ce{… <=> …}), ou deux courbes concentration-temps (function_graph) qui atteignent chacune un plateau différent.

### A6. Structure de la matière : modèle atomique, Lewis, liaisons, nomenclature, nucléaire (sec 4 ST ; liaisons, ions polyatomiques, isotopes, nucléaire en STE)

- Liaison covalente : chaque liaison = un doublet = 2 électrons partagés ; double liaison = 2 doublets = 4 électrons ; triple = 6. CO₂ s'écrit O=C=O (deux doubles liaisons) : C (4 électrons de valence) et O (6) sont deux NON-MÉTAUX, ils partagent leurs électrons et aucun ne les cède ; une liaison ionique demande un métal qui cède des électrons à un non-métal.
- Modèle de Rutherford-Bohr : un noyau (protons et neutrons) et des électrons sur des couches, au plus 2, puis 8, puis 8 pour les 20 premiers éléments. Sodium (Z = 11) : 2, 8, 1 ; son électron de valence le place dans la famille des alcalins (groupe IA), sa troisième couche dans la période 3.
- Notation de Lewis : le symbole et un point par électron de valence. Liaison ionique (STE) : un métal cède des électrons à un non-métal (NaCl) ; liaison covalente : deux non-métaux partagent des électrons (N₂, CO₂).
- Nomenclature (STE) : composé binaire = le non-métal en « -ure » puis le métal (chlorure de sodium) ; ions polyatomiques à connaître : \ce{NH4+} ammonium, \ce{OH-} hydroxyde, \ce{NO3-} nitrate, \ce{CO3^2-} carbonate, \ce{SO4^2-} sulfate, \ce{PO4^3-} phosphate ; les charges du composé s'annulent.
- Isotopes (STE) : même numéro atomique, nombre de neutrons différent ; la masse atomique relative est leur moyenne pondérée. Transformations nucléaires (STE) : la radioactivité, la fission (un gros noyau se brise) et la fusion (deux petits noyaux s'unissent) changent le noyau, donc l'élément, contrairement à une réaction chimique.
- Image : noyau = circle de rayon 0,6 (label inside « 11 p⁺, 12 n ») ; couches = circle de rayons 1,2, 2 et 2,8 ; électrons = point posés sur les couches (2 sur la première, 8 sur la deuxième, 1 sur la troisième).

### A7. Acides, bases, pH, électrolytes (sec 4 ST, sec 5 Chimie)

- Échelle pH de 0 à 14 : acide sous 7, neutre à 7, basique au-dessus. Une unité de pH = un facteur 10 de [H⁺]. En sec 5 : pH = −log[H⁺] et [H⁺] = 10^(−pH) : pH 1, 2, 3 donnent [H⁺] = 0,1 ; 0,01 ; 0,001 mol/L ([H⁺] BAISSE quand le pH monte). Kw = [H⁺][OH⁻] = 1,0 × 10⁻¹⁴ à 25 °C, donc pH + pOH = 14.
- Reconnaître (sec 4) : un acide libère des H⁺ en solution, sa formule commence souvent par H (HCl, H₂SO₄, HNO₃ ; exception : CH₃COOH, dont le H acide est à la fin) ; une base libère des OH⁻ (NaOH, Ca(OH)₂) ; un sel est fait d'un ion métallique et d'un ion non métallique ou polyatomique, sans H⁺ ni OH⁻ (NaCl, CaCO₃, KNO₃).
- Réaction de neutralisation acidobasique : acide + base → sel + eau, \ce{HCl + NaOH -> NaCl + H2O} (sel : formule en sec 4 STE).
- Un acide peut libérer plusieurs H⁺ : HCl 1, H₂SO₄ 2, H₃PO₄ 3 ; une base plusieurs OH⁻ : Ca(OH)₂ 2. Écris d'abord l'équation de neutralisation BALANCÉE (\ce{H3PO4 + 3NaOH -> Na3PO4 + 3H2O}), puis compte les moles avec ses coefficients.
- Titrage : au point d'équivalence (l'indicateur change de couleur), n(H⁺) = n(OH⁻), soit (H⁺ par acide) × Ca × Va = (OH⁻ par base) × Cb × Vb, volumes en L. Exemple juste : 25 mL de H₂SO₄ neutralisés par 30 mL de NaOH à 0,10 mol/L : n(OH⁻) = 0,10 × 0,030 = 0,0030 mol ; n(H₂SO₄) = 0,0030 ÷ 2 = 0,0015 mol ; C = 0,0015 ÷ 0,025 = 0,060 mol/L.
- Électrolyte : en solution, il se dissocie en ions libres qui conduisent le courant (dissociation électrolytique \ce{NaCl(s) -> Na+(aq) + Cl-(aq)}). Force d'un électrolyte (STE) : la part des particules dissociées.
- Conductibilité et pH sont deux choses : TOUTE solution d'ions conduit, acide, base OU sel (l'eau de Javel, basique, et l'eau salée, neutre, conduisent très bien) ; l'eau pure et l'eau sucrée presque pas. La conductibilité dépend de la quantité d'ions libres (concentration, électrolyte fort ou faible) ; le pH ne mesure que [H⁺].
- Image : number_line de 0 à 14, des points pour des substances usuelles (jus de citron ≈ 2, eau pure 7, eau de Javel ≈ 12, une base qui conduit) ; dissociation : deux circle collés avec leur label inside (Na⁺, Cl⁻), puis move de l'un pour les séparer.

### A8. Propriétés des solutions : concentration, dilution (sec 4 ST ; mol/L en STE)

- Concentration = quantité de soluté par volume de solution, le volume en LITRES (250 mL = 0,250 L). Exemple juste : 10 g de NaCl dans 250 mL : C = 10 ÷ 0,250 = 40 g/L ; M(NaCl) = 22,99 + 35,45 = 58,44 g/mol ; C = 40 ÷ 58,44 ≈ 0,68 mol/L (concentration molaire, STE). Aussi en % (g/100 mL) et en ppm (1 ppm = 1 mg/L dans l'eau). Unités : \pu{40 g/L}.
- Dilution : on ajoute du solvant, la quantité de soluté ne change pas, donc C₁V₁ = C₂V₂ et la concentration DIMINUE. Exemple juste : 2 mol/L × 50 mL = C₂ × 200 mL, C₂ = 0,5 mol/L. L'erreur 8 mol/L (2 × 200 ÷ 50) inverse le rapport : le volume est multiplié par 4, la concentration est divisée par 4.
- Image : la solution = un rectangle (polygon), le soluté = des points dedans ; dilution : les MÊMES points dans un rectangle quatre fois plus grand, à côté (dim du premier) : même quantité, plus de place, donc moins concentré.

### A9. Mole et masse molaire (sec 4 STE)

- Idée centrale : la mole est un paquet de 6,02 × 10²³ entités, comme une douzaine est un paquet de 12. La masse molaire M est la masse d'une mole (g/mol), somme des masses atomiques du tableau périodique.
- Exemple juste : M(H₂O) = 2 × 1,01 + 16,00 = 18,02 g/mol ; dans 36 g d'eau, n = m ÷ M = 36 ÷ 18,02 ≈ 2,0 mol. Dis « grammes par mole ». Garde les masses atomiques du tableau de l'élève, à deux décimales.
- Image : tableau de proportionnalité (matrix, row_labels « masse (g) » et « quantité (mol) ») [[18.02, 36.04, 9.01], [1, 2, 0.5]] et un label « ÷ 18,02 » attaché au tableau (anchor right) : passer des grammes aux moles, c'est diviser par M.

### A10. Balancement d'équations chimiques, conservation de la masse, combustion (sec 4 ST)

- Idée centrale (loi de la conservation de la masse) : les atomes ne se créent ni ne disparaissent, ils se réarrangent ; il faut autant de chaque sorte d'atome des deux côtés. On change les coefficients, jamais les indices (H₂O₂ n'est plus de l'eau).
- Méthode : compte les atomes de chaque élément des deux côtés ; balance d'abord les éléments présents dans une seule substance de chaque côté (C, puis H), l'oxygène à la fin, parce que O₂ est un élément seul : son coefficient ne change que l'oxygène. Exemple juste : \ce{C3H8 + 5O2 -> 3CO2 + 4H2O} ; vérification : C 3 = 3, H 8 = 8, O 10 = 6 + 4.
- Image : l'équation en math, une part par substance, chacune un \ce{…} complet avec son coefficient (\ce{C3H8}, \ce{+ O2}, \ce{-> CO2}, \ce{+ H2O} ; content = ces parts mises bout à bout), puis un transform par étape où seul un coefficient apparaît, dit sur son mot ; le décompte des atomes dans un matrix (row_labels « réactifs », « produits », column_labels les éléments) et un highlight part de la colonne de l'oxygène (« c3 ») pendant que tu l'équilibres.
- Image de la conservation : chaque atome = un circle de rayon 0,4 avec son symbole en label inside ; 2 H₂ + O₂ → 2 H₂O : 4 cercles H et 2 cercles O groupés en molécules (groups), puis move des groupes vers le côté des produits, où ils forment 2 H₂O : les mêmes cercles, surlignés des deux côtés sur le mot qui les compte.
- Combustion (ST) : il faut les trois côtés du triangle de feu, un combustible, un comburant (souvent le dioxygène) et un point d'ignition ; en enlever un éteint le feu.
- Dans say : « C trois H huit », « cinq O deux », « donne » pour la flèche.

## Partie B — Mathématiques

### B1. Question de physique, hors périmètre

- Cette question semble relever de la physique, hors du périmètre de Nesalio (mathématiques et chimie de secondaire 4 et 5). Si c'est bien de la physique, écris la leçon de refus d'une seule tranche (s_hors_perimetre), sans rien expliquer de physique.
- Propose une notion de maths proche : une trajectoire → la parabole et ses zéros ; une vitesse constante → la fonction affine et son taux de variation ; une pente, un angle → la trigonométrie du triangle rectangle ; ou une notion de chimie.
- Si la question porte en fait sur des maths ou de la chimie (lois des gaz, vitesse de réaction, énergie d'une réaction), explique-la normalement.

### B2. Dérivée, taux de variation, tangente

- Idée centrale : la dérivée en un point est la pente de la tangente, c'est-à-dire la limite des pentes des sécantes. N'écris la formule de f′ qu'APRÈS avoir montré d'où elle vient.
- Pente = montée ÷ avancée : dessine le triangle de pente (line horizontale « avancée », line verticale « montée », avec leurs nombres en label attaché) avant de diviser.
- Scénario : axes x de -1 à 4, y de -1 à 9 ; function_graph x^2 ; point A(1, 1) fixe ; point P(3, 9) sur la courbe. Sécante AP : pente (9 − 1) ÷ (3 − 1) = 4. Puis P(2, 4) : pente 3 ; P(1,5 ; 2,25) : pente 2,5. Chaque nouvelle sécante est une function_graph droite (ex. 3*(x-1)+1) qui remplace la précédente (fade_out de l'ancienne), et sa pente est écrite.
- Pour faire pivoter la sécante sous les yeux de l'élève : paramètre q dans math_context (initial 3, min 1, max 3) et function_graph "(q+1)*(x-1)+1" (la pente de AP vaut q + 1) ; animate_parameter q de 3 vers 1 pendant que tu dis que P se rapproche de A et que la pente passe de 4 à 2. À la fin c'est la tangente y = 2x − 1 : pente 2.
- Pour f(x) = x², la pente de la sécante entre 1 et q vaut q + 1 : elle DIMINUE de 4 vers 2 quand q va de 3 à 1. Vérifie : le nombre dérivé de x² en 1 est 2, en 2 il est 4 (jamais « 2 » en x = 2).
- Sens concret : le nombre dérivé est une vitesse instantanée (position → vitesse) ou un taux de variation instantané ; dis-le avec un exemple concret simple, et utilise le vocabulaire québécois « taux de variation », pas « coefficient directeur ».

### B3. Statistiques, nuage de points, corrélation

- Idée centrale de r : il mesure à quel point les points du nuage sont proches d'une DROITE, donc la force d'un lien LINÉAIRE entre deux variables. −1 ≤ r ≤ 1 ; le signe donne le sens (négatif : quand x augmente, y a tendance à diminuer), |r| la force.
- Montre-le avec des nuages calculés (point dans des axes dont chaque axe est nommé par un label), et sa droite d'ajustement (function_graph). Nuages justes, axes x de 0 à 8 et y de 0 à 9 : r ≈ −0,81 : (1, 7) (2, 8) (3, 5) (4, 6) (5, 6) (6, 3) (7, 4), droite ≈ −0.64*x+8.14 ; r = −1 : (1, 7) (2, 6) … (7, 1), tous SUR la droite 8 − x ; r ≈ 0 : (1, 4) (2, 6) (3, 2) (4, 5) (5, 3) (6, 6) (7, 4).
- Interprète la valeur avec les mots de la classe : r = −0,8, lien linéaire négatif fort (certains manuels disent moyen-fort), jamais « faible » ni « parfait ».
- Estimation de r par la méthode du rectangle : trace le PLUS PETIT rectangle qui contient TOUS les points du nuage (allongé dans le sens du nuage) ; L = sa longueur (grand côté), l = sa largeur (petit côté), mesurées à la règle ; r ≈ ±(1 − l/L), le signe selon le sens du nuage. Ex. l = 2 et L = 8 : r ≈ ±(1 − 2/8) = ±0,75. Nuage étroit (l petit) : |r| proche de 1. Au tableau, vérifie que chaque point est dans le polygon du rectangle.
- Tableau à double entrée : regarde dans quel ordre sont rangées les valeurs de chaque variable (souvent croissantes vers le BAS pour les lignes) ; si les grands effectifs relient les petites valeurs des deux variables aux grandes, la corrélation est positive, même si cette diagonale descend sur la feuille.
- Dis toujours qu'une corrélation n'est pas une causalité, avec un exemple (ventes de crème glacée et coups de soleil : c'est la chaleur qui fait monter les deux).
- Un tableau (matrix) ne contient que des valeurs calculées (cases texte courtes possibles, ex. « 64 % »), jamais de remplissage.
- Moyenne = le total partagé également ; médiane = la valeur du milieu des données ORDONNÉES (moyenne des deux du milieu si leur nombre est pair) ; montre les données triées sur une number_line.

### B4. Probabilités, dénombrement, probabilité conditionnelle

- Probabilité = cas favorables ÷ cas possibles, SEULEMENT si les issues sont équiprobables. Dessine l'univers : des cases égales (polygon carrés côte à côte, un label inside par issue) ou le tableau des 36 issues de deux dés (matrix 6 × 6 des sommes, row_labels « 1 » à « 6 » pour le premier dé, column_labels pour le deuxième ; highlight part « r1c6 » pour une issue).
- Piège : les 11 sommes de deux dés ne sont pas équiprobables (7 sort de 6 façons, 2 d'une seule) : P(somme 7) = 6/36 = 1/6, pas 1/11.
- Probabilité conditionnelle : savoir que B s'est produit RÉDUIT l'univers à B. Estompe (dim) les cases hors de B : B est le nouveau tout, d'où P(A | B) = P(A ∩ B) ÷ P(B), « la part de B où A est aussi vrai ». Condition : P(B) ≠ 0, dite avant la formule.
- Exemple juste (un dé) : A = « pair », B = « plus grand que 3 » ; B = {4, 5, 6}, A ∩ B = {4, 6} ; P(A | B) = 2/3, et (2/6) ÷ (3/6) = 2/3 donne la même valeur. Six carrés de côté 1 en ligne, de x = 0 à x = 6.
- Ne confonds jamais P(A | B) (une part de B), P(A ∩ B) (une part de tout l'univers) et P(B | A) : écris-les côte à côte avec leurs valeurs (2/3, 2/6, 2/3 ici, mais pas en général).
- Arbre : branches (line) avec leur probabilité en label ; on multiplie le long d'un chemin, on additionne les chemins ; les branches d'un même nœud font 1. Garde les fractions exactes jusqu'au résultat.

### B5. Mathématiques financières, intérêts

- Idée centrale de l'intérêt composé : chaque période, l'intérêt s'ajoute au capital et rapporte à son tour (intérêt sur l'intérêt). Ajouter 4 %, c'est multiplier par 1,04.
- Tableau année par année d'abord (matrix, row_labels « année » et « capital ($) ») : 2000 $ à 4 % donne 2080 ; 2163,20 ; 2249,73 ; 2339,72 ; 2433,31. Un label « × 1,04 chaque année » attaché au tableau.
- Puis la formule C = C₀(1 + i)ⁿ, reliée au tableau (n multiplications par 1 + i) : 2000 × 1,04⁵. Calcule-la d'un bloc : 2000 × 1,04⁵ = 2433,31 $ ; arrondir 1,04⁵ à 1,2167 avant de multiplier donne 2433,40 $, faux. Déclare-la dans math_context.expressions et écris la même valeur.
- Écris la réponse avec son unité, et l'intérêt gagné (433,31 $). Compare à l'intérêt simple (2000 + 5 × 80 = 2400 $) : la différence, c'est l'intérêt sur l'intérêt.
- Si l'intérêt est composé chaque mois, i devient le taux annuel ÷ 12 et n le nombre de mois. Une dépréciation multiplie par (1 − i). Pas de graphique en dollars : ces valeurs dépassent un repère lisible ; le tableau suffit.

### B6. Inéquations à deux variables, polygone de contraintes, optimisation

- Idée centrale : chaque contrainte (inéquation en x et y) garde un DEMI-PLAN ; le polygone de contraintes est la partie commune à tous. Trace la droite frontière (y isolé), puis prends un point test qui n'est pas sur elle (souvent (0 ; 0)) : s'il vérifie l'inéquation, son côté est le bon. En classe : trait plein pour ≤ ou ≥, pointillé pour < ou >.
- Isoler y : multiplier ou diviser par un nombre NÉGATIF inverse le sens de l'inégalité (−2y ≤ 6 donne y ≥ −3).
- Sommets : chacun est l'intersection de DEUX frontières, CALCULÉE en résolvant leur système, jamais lue à l'œil ; garde seulement les sommets qui vérifient TOUTES les contraintes (vérification écrite). x ≥ 0 et y ≥ 0 sont des contraintes aussi.
- Optimisation : la fonction à optimiser (ex. z = 3x + 2y) atteint son maximum et son minimum à un SOMMET du polygone fermé : calcule-la à chaque sommet dans un matrix, puis compare.
- Exemple juste : x ≥ 0, y ≥ 0, x + y ≤ 6, y ≤ 2x ; y = 6 − x et y = 2x se coupent en (2 ; 4) ; sommets (0 ; 0), (6 ; 0), (2 ; 4) : un triangle ; z = 3x + 2y vaut 0, 18 et 14, maximum 18 en (6 ; 0).
- Image : axes avec x et y ≥ 0, chaque frontière en function_graph, la région en polygon dont les sommets sont les points calculés, et un point avec son label à chaque sommet.

### B7. Procédures de vote, règle de la majorité

- Majorité (absolue) : il faut PLUS DE LA MOITIÉ des votes exprimés. Seuil = le premier entier STRICTEMENT plus grand que la moitié : 9 votes → 9 ÷ 2 = 4,5 → 5 ; 10 votes → 10 ÷ 2 = 5 → 6 (5 n'est que la moitié). Donc n pair : n/2 + 1 ; n impair : (n + 1)/2. Vérifie toujours la règle sur un nombre pair ET un nombre impair. La « demi-majorité » n'existe pas.
- Pluralité (majorité relative) : gagne l'option qui a le plus de votes, même sans en avoir la moitié.
- Autres procédures du programme : Borda (des points selon le rang sur chaque bulletin, on additionne) ; Condorcet (gagne celui qui bat chacun des autres en duel) ; élimination successive (on retire l'option qui a le moins de premiers choix et on reporte ses votes) ; approbation (chacun vote pour toutes les options qu'il accepte).
- Image : number_line de 0 à n, la moitié marquée, le seuil (premier entier au-dessus) en result.

### B8. Théorie des graphes : chemins, chemin critique

- Vocabulaire : des sommets reliés par des arêtes ; graphe orienté = arêtes fléchées, on suit le sens des flèches ; graphe valué = chaque arête porte une valeur (durée, coût, distance).
- Chemin de valeur minimale (le plus court) : entre deux sommets, celui dont la somme des valeurs est la plus PETITE (trajet le moins cher, le plus rapide). Chemin critique : dans le graphe orienté des tâches d'un projet, le chemin du départ à l'arrivée dont la somme des durées est la plus GRANDE ; cette somme est le temps MINIMAL pour réaliser tout le projet, car une tâche attend celles qui la précèdent.
- Lequel choisir : la question demande le trajet le moins coûteux ou le plus court → valeur minimale ; le temps minimal pour réaliser TOUTES les tâches d'un projet → chemin critique (le plus long).
- Méthode écrite : énumère chaque chemin du départ à l'arrivée et écris sa somme dans une formule (A → B → D : 3 + 4 = 7), puis compare les sommes. Aucune somme de tête.
- Chaîne eulérienne : passe une seule fois par chaque arête ; dans un graphe connexe, elle existe si 0 ou 2 sommets sont de degré impair (circuit eulérien : 0). Chaîne hamiltonienne : passe une seule fois par chaque sommet.
- Image : chaque sommet = point avec son label ; chaque arête = arrow (orienté) ou line, sa valeur dans un label attaché ; le chemin retenu surligné arête par arête.

### B9. Systèmes d'équations

- Idée centrale : la solution est le couple (x ; y) qui vérifie les deux équations EN MÊME TEMPS, le point de rencontre de leurs droites. Montre-le : deux function_graph dans le même repère, et le point d'intersection avec ses coordonnées (ex. y = x + 1 et y = −x + 5 se rencontrent en (2 ; 3), axes x de −1 à 5, y de −1 à 7).
- Nomme la méthode de la classe : comparaison (les deux y isolés, donc on les égale, parce qu'au point de rencontre ils sont égaux), substitution (on remplace y par son expression), réduction (on additionne ou soustrait les équations pour faire disparaître une variable, après avoir multiplié si besoin).
- Chaque opération sur les deux membres, écrite et justifiée (transform) ; puis y en remplaçant x dans une équation ; puis la vérification dans les DEUX équations, écrite (2 + 1 = 3 et −2 + 5 = 3).
- Si l'élève a trouvé une valeur fausse, remplace-la aussi : les deux équations donnent deux y différents, donc ce n'est pas le point de rencontre. Retrouve l'opération qui produit sa valeur (un terme ajouté au lieu d'être soustrait).
- Droites parallèles (même pente, valeurs initiales différentes) : aucune solution ; droites confondues : une infinité.

### B10. Valeur absolue

- Idée centrale : |u| est la DISTANCE de u à 0 sur la droite des nombres. Montre-le : number_line de −8 à 8, deux arrow partant de 0, de même longueur, vers 7 et vers −7. Donc |u| = 7 veut dire u = 7 ou u = −7 : deux cas, deux solutions.
- Résous les deux cas l'un à côté de l'autre, chaque étape justifiée : |2x − 3| = 7 donne 2x − 3 = 7 (x = 5) ou 2x − 3 = −7 (x = −2). Écris l'ensemble-solution {−2, 5}, puis vérifie les deux valeurs (|7| = 7 et |−7| = 7).
- Isole d'abord la valeur absolue (2|x − 1| + 3 = 9 → |x − 1| = 3). |u| = un nombre négatif : aucune solution ; |u| = 0 : une seule.
- Lecture graphique : y = |x − 1| (function_graph "abs(x-1)", un V de sommet (1 ; 0)) coupe la droite y = 3 en deux points, x = −2 et x = 4. Forme canonique de la classe : f(x) = a|b(x − h)| + k, sommet (h ; k).
- Inéquation : |x − h| < r, ce sont les x à MOINS de r unités de h : x ∈ ]h − r ; h + r[ ; |x − h| > r, à PLUS de r unités de h : x ∈ ]−∞ ; h − r[ ∪ ]h + r ; +∞[. Crochet fermé (vers le nombre) pour ≤ ou ≥, toujours ouvert du côté de l'infini. Ex. |x − 1| > 3 : x < −2 ou x > 4, distance à 1 et non à 0 ; vérifie avec un x de chaque morceau.
- Dans say : « valeur absolue de deux x moins trois », jamais « barre ».

### B11. Géométrie analytique : pente, milieu, distance, droites

- Chaque formule vient du dessin, dans un repère où les points sont posés (point et label) : pente = montée ÷ avancée (triangle de pente en line) ; milieu = la moyenne des coordonnées ; distance = Pythagore sur le triangle de l'avancée et de la montée, √(Δx² + Δy²).
- Perpendiculaires : pentes opposées inverses, m₁ × m₂ = −1. Justifie-le : un quart de tour échange l'avancée et la montée et change un signe (pente 1/2 → pente −2). Parallèles : même pente.
- Médiatrice : la droite perpendiculaire au segment qui passe par son milieu ; tous ses points sont à la même distance de A et de B. Étapes écrites : milieu M ; pente de AB ; pente perpendiculaire ; y = mx + b avec b trouvé en remplaçant M.
- Exemple juste : A(0 ; 1), B(4 ; 3) ; M(2 ; 2) ; pente de AB = 2/4 = 1/2 ; pente de la médiatrice −2 ; y = −2x + 6. Trace-la avec son expression (function_graph "-2*x+6"), jamais une line entre deux points estimés.
- Vérifie au tableau : M est sur la droite (−2 × 2 + 6 = 2), et un point P(1 ; 4) de la médiatrice est à la même distance de A et de B (PA = PB = √10, segments PA et PB tracés).
- Formes d'une droite en classe : fonctionnelle y = mx + b, générale Ax + By + C = 0, symétrique x/a + y/b = 1. De fonctionnelle à générale : tout du même côté, coefficients entiers (y = 2x − 5 devient 2x − y − 5 = 0).
- Un seul point ne détermine pas une droite : il faut une 2e information (la pente, un 2e point, une droite parallèle ou perpendiculaire). Dis ce que l'élève a et ce qui lui manque, puis où l'énoncé donne cette information.

### B12. Trigonométrie du triangle quelconque : lois des sinus et des cosinus

- Loi des sinus, valable dans TOUT triangle : a / sin A = b / sin B = c / sin C ; chaque côté est apparié à l'angle qui lui est OPPOSÉ. Montre l'appariement : highlight du côté a et de l'angle A sur le même mot, puis b et B.
- Figure calculée : A en (0 ; 0), B en (c ; 0), C en (b·cos A ; b·sin A), arrondis au centième pour le dessin seulement. Un polygon n'a pas d'ancre de sommet : un point à chaque sommet porte son label (A, B, C) ; chaque côté nommé est une line entre ses deux sommets, avec son label attaché ; le côté a relie B et C, en face de A.
- Contrôle de vraisemblance à dire : le plus grand angle est en face du plus grand côté. Si l'élève a inversé les sinus, recalcule sa valeur pour le montrer (10 × sin 40° ÷ sin 60° au lieu de 10 × sin 60° ÷ sin 40°).
- Calculatrice en mode degrés, dit à voix haute ; garde la valeur de la calculatrice jusqu'au résultat, arrondi à la fin.
- Loi des cosinus : c² = a² + b² − 2ab cos C, pour deux côtés et l'angle entre eux, ou trois côtés. Si C = 90°, cos C = 0 et on retrouve Pythagore : dis-le. Aire = ab sin C ÷ 2 ; formule de Héron avec le demi-périmètre p.

### B13. Coniques : parabole (foyer, directrice), ellipse, hyperbole, cercle (sec 5 SN)

- Parabole = les points à égale distance du foyer et de la directrice : le sommet est au MILIEU entre le foyer et la directrice ; c = distance du sommet au foyer = la moitié de la distance foyer–directrice. Forme : (x − h)² = 4c(y − k), ouverte vers le haut si c > 0 (ou (y − k)² = 4c(x − h)). Ex. foyer (0 ; 3), directrice y = −1 : sommet (0 ; 1), c = 2, x² = 8(y − 1).
- Ellipse centrée à l'origine : x²/a² + y²/b² = 1, a et b les demi-axes (horizontal, vertical) ; foyers sur le grand axe, c² = a² − b² si a > b. Trouver b avec un point : remplace, isole le terme en b, puis b², puis b, chaque étape écrite (point (3 ; 2) et a = 5 : 9/25 + 4/b² = 1, 4/b² = 16/25, b² = 6,25, b = 2,5).
- Hyperbole : x²/a² − y²/b² = 1, c² = a² + b². Cercle : (x − h)² + (y − k)² = r².
- Image : ellipse en parametric_curve (x = a*cos(t), y = b*sin(t), t de 0 à 6.283), parabole en function_graph ; foyers et sommets en point avec label ; directrice en line.

### B14. Fonctions, exponentielle, logarithme, partie entière

- Fonction = relation entrée → sortie, une seule sortie par entrée. Montre quelques couples (entrée, sortie) dans un tableau (matrix avec row_labels « x » et « f(x) »), puis chaque couple devient un point du graphique, et les points forment la courbe.
- Repère lisible : même échelle en x et en y, étendue en y au plus le double de celle en x ; les grandes valeurs vont dans un tableau, pas en points hors du repère. Étiquette de courbe = sa règle courte (« x² », « 2x + 1 »).
- Parabole : le sommet est sur l'axe de symétrie x = h (line verticale tracée pendant que tu surlignes la formule de h). Justifie x = −b ÷ (2a) (milieu des zéros, ou forme canonique) avant de l'utiliser, puis calcule AUSSI l'ordonnée en remplaçant x, et écris S(x ; y). Zéros : on résout f(x) = 0, et on les pointe sur l'axe des x.
- Forme canonique f(x) = a(x − h)² + k : (h, k) est le sommet, a l'ouverture. Rôle d'un paramètre : la courbe de base en secondary, la courbe avec le paramètre, une valeur calculée (math, content computed, precision 0) qui suit, et animate_parameter (un seul paramètre à la fois).
- Exponentielle 2^x : repère x de 0 à 4, y de 0 à 8 ; compare « × 2 à chaque pas » et « + 2 à chaque pas » (deux courbes nommées et un tableau de valeurs) ; la hausse d'un pas est une flèche VERTICALE au bout du pas.
- Logarithme = l'exposant qu'il faut : log₂(8) = 3 parce que 2³ = 8. Sur 2^x, pars de 8 sur l'axe des y, va à l'horizontale jusqu'à la courbe puis descends à x = 3 (lines). Écris les bases en indice (log₂), jamais « log_b ».
- Partie entière [x] : le plus grand entier inférieur ou égal à x ([3,7] = 3, [−2,3] = −3 : piège classique). Forme canonique f(x) = a[b(x − h)] + k ; |a| = écart entre deux marches, 1/|b| = longueur d'une marche. Courbe : function_graph "floor(x)" (ou "a*floor(b*(x-h))+k"), jamais une expression sans marches.
- Zéros de la partie entière : f(x) = 0 donne [b(x − h)] = −k/a ; si −k/a n'est pas entier, aucun zéro ; s'il vaut l'entier n, tous les x de n ≤ b(x − h) < n + 1 sont des zéros : un INTERVALLE. Ex. f(x) = 2[x − 1] − 4 : [x − 1] = 2, 2 ≤ x − 1 < 3, zéros x ∈ [3 ; 4[ (si b < 0, l'intervalle est ouvert à gauche et fermé à droite).
- Règle d'une fonction du second degré à partir d'une table (x de 1 en 1) : les différences premières (entre deux f(x) voisins) changent, les différences secondes sont constantes et valent 2a ; puis c = f(0), et b avec un autre point.
- Équation exponentielle à bases différentes : log des deux côtés, l'exposant descend (log(aᵘ) = u·log a), on isole x. Ex. 2^x = 3^(x − 1) : x·log 2 = (x − 1)·log 3, x = \frac{\log 3}{\log 3 - \log 2} ≈ 2,71 dans la même formule, puis vérifie.
- Sinusoïdale f(x) = a sin(b(x − h)) + k : amplitude |a|, période 2π ÷ |b| (la longueur d'un cycle : entre deux sommets voisins). cos x = sin(x + π/2) : même courbe, décalée d'un quart de période.

### B15. Polynômes, produits remarquables, factorisation

- Méthodes du programme, dans cet ordre de réflexion, nommées à voix haute : mise en évidence simple (toujours d'abord) ; quatre termes → mise en évidence double ; a² − b² → différence de deux carrés ; a² ± 2ab + b² → trinôme carré parfait ; ax² + bx + c → méthode produit-somme ; sinon complétion du carré ou formule quadratique. Jamais de raccourci hors programme.
- MODÈLE D'AIRE pour multiplier deux binômes ou expliquer un produit remarquable : un grand carré ou rectangle (polygon) découpé en pièces (polygons), chaque pièce avec son aire en label attaché (x², 5x, 5x, 25). (x + 5)² montre les DEUX pièces 5x : c'est le 10x qu'on oublie quand on écrit x² + 25.
- Produit-somme : écris la recherche (produit a × c, somme b, paires essayées), puis la décomposition et la double mise en évidence, ligne par ligne avec transform.
- Vérifie toute factorisation en redéveloppant : factoriser et développer sont les deux sens du même chemin.
- Complétion du carré : x² + 6x, c'est un carré x × x et une bande 6x coupée en deux bandes 3x ; il manque le coin 3 × 3 = 9. D'où x² + 6x = (x + 3)² − 9. On ajoute et on retire le CARRÉ de la moitié du coefficient, pas la moitié.
- Expression rationnelle : factorise, écris les RESTRICTIONS avant de simplifier (le dénominateur ≠ 0, y compris pour un facteur qui va disparaître), puis simplifie des FACTEURS, jamais des termes ((x + 3)/3 ne se simplifie pas). Diviser = multiplier par l'inverse, et le numérateur du diviseur ajoute une restriction ; additionner : dénominateur commun (PPCM des facteurs).
- Division par un binôme, comme en classe, une ligne par geste (math empilées, sans transform : l'élève les compare) : diviser le premier terme, multiplier, SOUSTRAIRE (chaque signe change), abaisser le terme suivant. Exemple juste : (2x³ − 5x² − 4x + 3) ÷ (x − 3) : 2x³ ÷ x = 2x² ; 2x²(x − 3) = 2x³ − 6x² ; reste x² − 4x ; puis + x, reste −x + 3 ; puis − 1, reste 0. Quotient 2x² + x − 1. Un terme manquant s'écrit 0x². Termine par la vérification écrite « dividende = diviseur × quotient + reste ». Division par un monôme : chaque terme divisé, exposants soustraits.
- Équation du second degré : factorise, puis produit nul (« un produit vaut 0 si l'un de ses facteurs vaut 0 » : (x − 3)(x + 1) = 0 donne x = 3 ou x = −1) ; jamais diviser les deux côtés par x (on perd x = 0). Sinon la formule quadratique x = (−b ± √Δ) ÷ 2a, avec Δ = b² − 4ac, venue de la complétion du carré (montre-le ou dis qu'on l'admet).
- Discriminant : Δ > 0, deux zéros ; Δ = 0, un seul ; Δ < 0, aucun zéro réel. Image : la parabole x² − 2x + k (k paramètre de −3 à 2, animate_parameter) monte et croise l'axe des x en deux, un, puis zéro points, pendant que Δ = 4 − 4k change de signe.

### B16. Équations, signes, fractions

- Équation : écris-la une fois et fais-la évoluer par transform. Chaque opération en deux temps : d'abord l'opération écrite des DEUX côtés (« 2x − 1 − 2x = 3x − 4 − 2x »), puis le résultat simplifié ; dis POURQUOI on la fait.
- Regroupe les x du côté où leur coefficient reste positif ; si tu arrives à −x = −3, montre « on multiplie les deux côtés par −1 ».
- Vérification finale : remplace la solution dans l'équation de DÉPART, un côté après l'autre, et écris que les deux côtés sont égaux.
- Distributivité : le facteur multiplie chaque terme AVEC son signe (« 2 fois moins 3 égale moins 6 »).
- Pas de balance dessinée en traits décoratifs : un dessin porte une quantité.
- Fractions : une unité = un rectangle (polygon) coupé en parts égales par des line ; les parts prises sont des polygon colorés qu'on compte. Additionner demande des parts de même taille (même dénominateur) : montre le découpage commun avant le calcul.
- Diviser par une fraction = « combien de morceaux de cette taille dans… » (2 ÷ 1/3 : deux barres coupées en tiers, on en compte 6).
- Proportionnalité : un tableau de valeurs (matrix avec row_labels), le coefficient testé colonne par colonne, puis la règle de trois ou le produit en croix justifiés par ce coefficient.Image : un label « × 3 » attaché au tableau (anchor right, à mi-hauteur entre les deux lignes), surligné sur « fois trois ».

### B17. Géométrie, trigonométrie, Pythagore

- La figure dit les mêmes nombres que toi : triplets entiers (3-4-5, 6-8-10, 5-12-13), mesures écrites en label attaché aux côtés.
- Pythagore, image : triangle_right (angle droit à l'origine, leg_a sur x, leg_b sur y) et trois carrés posés sur les côtés (polygon), l'aire écrite dedans (label, placement inside). Pour 3 et 4 : [[0, 0], [3, 0], [3, -3], [0, -3]], [[0, 0], [0, 4], [-4, 4], [-4, 0]] et [[3, 0], [0, 4], [4, 7], [7, 3]] ; 9 + 16 = 25 se lit sur les aires.
- Pythagore : triangle_right avec ses deux côtés de l'angle droit ; nomme l'hypoténuse (en face de l'angle droit, le plus long côté) en la surlignant ; montre que a² + b² = c² se lit sur la figure avant de calculer, puis la racine carrée.
- Trigonométrie : repère d'abord, sur la figure, l'opposé, l'adjacent et l'hypoténuse par rapport à l'angle choisi (highlight de chacun sur le mot qui le nomme), puis écris le rapport, puis sa valeur, puis l'angle avec sin⁻¹ (« la touche 2nd, en mode degrés »).
- Triangles semblables ou isométriques : mêmes marques sur les éléments homologues des deux triangles, et dis la correspondance.
- Aires et volumes : la formule se justifie par un découpage ou un recollement montré (le triangle est la moitié du rectangle).
- Radian : l'angle au centre qui intercepte un arc de longueur égale au rayon. Cercle de rayon 3 (circle) et l'arc tracé (parametric_curve x = 3*cos(t), y = 3*sin(t), t de 0 à 1 : longueur 3). Le tour contient 2π rayons, donc 2π rad = 360°, π rad = 180°, 1 rad ≈ 57,3° ; mène une conversion au résultat (90° = π/2) ; dis le mode radians ou degrés de la calculatrice.
- sin⁻¹ n'est pas 1 ÷ sin : c'est l'angle dont le sinus vaut ce nombre. Pour montrer d'où vient un nombre, move de son étiquette jusqu'à la formule. Un petit exemple à part se pose après dim de la figure. Un solide se montre par son patron ou une coupe nommée (polygon).

## Partie C — Aide-mémoire (faits ajoutés quand le mot apparaît dans la question)

1. bicarbonate de soude = hydrogénocarbonate de sodium, NaHCO₃ (sa solution est faiblement basique)
2. vinaigre = solution d'acide acétique CH₃COOH (≈ 5 %), acide faible qui libère un seul H⁺
3. eau de Javel = solution d'hypochlorite de sodium NaClO, basique (pH ≈ 11 à 13), électrolyte : elle conduit très bien le courant
4. sel de table = chlorure de sodium NaCl, un sel : sa solution est neutre et conduit le courant
5. hydroxyde de sodium (soude caustique) NaOH : base forte, un OH⁻
6. acide chlorhydrique HCl : acide fort, un H⁺
7. acide sulfurique H₂SO₄ : deux H⁺ par molécule (n(H⁺) = 2 × n(H₂SO₄))
8. acide phosphorique H₃PO₄ : trois H⁺ par molécule ; neutralisation complète \ce{H3PO4 + 3NaOH -> Na3PO4 + 3H2O}
9. acide nitrique HNO₃ : acide fort, un H⁺
10. acide carbonique H₂CO₃ : deux H⁺ ; il se décompose en H₂O + CO₂
11. ammoniac NH₃ : un gaz, une base (avec l'eau, il forme NH₄⁺ et OH⁻)
12. hydroxyde de calcium (chaux éteinte) Ca(OH)₂ : base, deux OH⁻
13. carbonate de calcium (calcaire, craie) CaCO₃ : un sel
14. méthane CH₄ (gaz naturel) ; combustion \ce{CH4 + 2O2 -> CO2 + 2H2O}
15. propane C₃H₈
16. glucose C₆H₁₂O₆
17. éthanol C₂H₅OH
18. dioxyde de carbone CO₂ : molécule covalente O=C=O (deux non-métaux)
19. monoxyde de carbone CO
20. dioxyde de soufre SO₂, M = 32,07 + 2 × 16,00 = 64,07 g/mol
21. dihydrogène H₂, dioxygène O₂, diazote N₂ : molécules de deux atomes
22. peroxyde d'hydrogène (eau oxygénée) H₂O₂, pas H₂O
23. dihydroxyde de magnésium Mg(OH)₂ : sel peu soluble de type 1 : 2 (Kps = 4s³)
24. dichlorure de plomb PbCl₂ : sel peu soluble de type 1 : 2 (Kps = 4s³)
25. solidification (congélation), condensation liquide (liquéfaction), condensation solide : changements physiques EXOTHERMIQUES (ΔH < 0)
26. fusion, vaporisation (ébullition, évaporation), sublimation : changements physiques ENDOTHERMIQUES (ΔH > 0) ; la fusion nucléaire, elle, est une transformation nucléaire
27. désintégration radioactive et fission (uranium) : transformations NUCLÉAIRES, ni physiques ni chimiques
