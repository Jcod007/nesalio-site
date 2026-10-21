/**
 * Consignes propres au domaine : Polynômes, factorisation et expressions rationnelles,
 * le cœur de la 1re étape de mathématique SN 4 (sept. à nov.) : manipulations
 * algébriques (multiplication et division de polynômes), factorisation (mise en
 * évidence simple et double, trinôme carré parfait, différence de deux carrés,
 * trinôme ax² + bx + c par produit-somme, complétion du carré), expressions
 * rationnelles (restrictions, simplification, opérations).
 * Méthodes et vocabulaire des classes québécoises : l'élève doit reconnaître ce
 * que son enseignant fait au tableau, pas une autre méthode juste.
 * Rendues au modèle dans la section « PAR DOMAINE » de la consigne.
 */
import type { DomainGuide } from "./types";

export const polynomes: DomainGuide = {
  id: "polynomes",
  title: "Polynômes, factorisation et expressions rationnelles (SN 4, 1re étape)",
  rules: [
    // Les méthodes enseignées au Québec, avec leur nom : un corrigé par une autre méthode perd l'élève en classe.
    "Méthodes et noms du programme, dans cet ordre de réflexion : 1) mise en évidence simple (le plus grand facteur commun, " +
      "TOUJOURS en premier) ; 2) quatre termes → mise en évidence double (on groupe deux par deux) ; 3) a² − b² → différence de " +
      "deux carrés (a + b)(a − b) ; 4) a² ± 2ab + b² → trinôme carré parfait (a ± b)² ; 5) ax² + bx + c → méthode PRODUIT-SOMME : " +
      "deux nombres m et n avec m × n = a × c et m + n = b, on décompose bx en mx + nx, puis mise en évidence double ; " +
      "6) sinon, complétion du carré ou formule quadratique. Nomme la méthode à voix haute (« c'est une différence de deux carrés »). " +
      "Jamais de « méthode AC », de « diviser par a » ni de raccourci que l'élève n'a pas vu en classe.",
    "Produit-somme : écris la recherche dans la colonne (\"note\") comme en classe : « produit : 2 × (−15) = −30 ; somme : −7 », " +
      "puis les paires essayées « −10 et 3 ✓ ». Puis 2x² − 7x − 15 = 2x² − 10x + 3x − 15 = 2x(x − 5) + 3(x − 5) = (x − 5)(2x + 3), " +
      "par \"transform\" de la même ligne. Les mauvais choix de tes questions : les signes inversés (−3 et 10), la paire dont le " +
      "produit vaut c au lieu de a × c.",
    "Vérifie toute factorisation en redéveloppant (une \"note\" : « (x − 5)(2x + 3) = 2x² + 3x − 10x − 15 = 2x² − 7x − 15 ✓ ») : " +
      "c'est ce que l'enseignant exige, et ça montre que factoriser et développer sont deux sens du même chemin.",
    // Le geste qui fait comprendre : le modèle d'aire (tuiles algébriques).
    "MODÈLE D'AIRE (multiplier deux binômes, factoriser un trinôme, compléter le carré) : \"areaModel\" avec les termes des " +
      "deux facteurs (\"rows\":[\"x\",\"2\"], \"cols\":[\"x\",\"3\"]) ; le moteur écrit chaque produit dans sa pièce. Ne dessine " +
      "jamais les pièces en \"polygon\" ni les produits en \"text\". Développer = additionner les pièces (les deux pièces en x " +
      "s'additionnent : 2x + 3x = 5x) ; factoriser = retrouver les côtés du rectangle à partir des pièces.",
    "Complétion du carré avec le modèle d'aire : x² + 6x = \"areaModel\" rows [\"x\",\"3\"], cols [\"x\",\"3\"] avec " +
      "\"empty\":[[1,1]] (la bande 6x coupée en deux moitiés 3x, le coin manquant « ? ») ; l'élève prédit ce qu'il manque, puis " +
      "redemande la même figure sans \"empty\" : le coin 9 apparaît. D'où x² + 6x = (x + 3)² − 9.",
    "Produits remarquables : (a + b)² = a² + 2ab + b², le piège est d'oublier 2ab : montre-le avec le modèle d'aire (les deux " +
      "bandes ab). (a + b)(a − b) = a² − b² : les termes du milieu s'annulent : écris-les, puis estompe-les (\"dim\") en le disant.",
    // Division de polynômes : la potence de la classe, ligne par ligne.
    "Division d'un polynôme par un binôme (x − a) : la méthode de la classe, comme la division euclidienne, une étape par " +
      "ligne de la colonne : diviser le premier terme (« 2x³ ÷ x = 2x² »), multiplier (« 2x²(x − 3) = 2x³ − 6x² »), SOUSTRAIRE " +
      "(attention au signe de chaque terme), abaisser le terme suivant. Écris dividende, diviseur, quotient et reste avec leur nom, " +
      "et termine par la vérification « dividende = diviseur × quotient + reste ». Un terme manquant s'écrit avec 0 (x³ + 0x² − 2x + 1).",
    "Division par un monôme : chaque terme est divisé (« (6x³ − 4x) ÷ 2x = 3x² − 2 »), puis on soustrait les exposants : " +
      "x³ ÷ x = x², pas x³.",
    // Expressions rationnelles : les restrictions d'abord.
    "Expression rationnelle : 1) factorise numérateur et dénominateur ; 2) écris les RESTRICTIONS avant de simplifier " +
      "(« x ≠ 3 et x ≠ −2 », le dénominateur ≠ 0, y compris pour les facteurs qui vont disparaître) ; 3) simplifie les facteurs " +
      "communs (on barre un FACTEUR, jamais un terme : (x + 3)/3 ne se simplifie pas). Diviser = multiplier par l'inverse, et le " +
      "numérateur du diviseur ajoute une restriction. Additionner : dénominateur commun (le PPCM des facteurs), comme pour 1/4 + 1/6.",
    "Équation du 2e degré dans cette étape : factorise puis produit nul (« un produit vaut 0 si un de ses facteurs vaut 0 ») ; " +
      "sinon formule quadratique x = (−b ± √(b² − 4ac)) / 2a avec le discriminant Δ = b² − 4ac (Δ < 0 : aucune solution réelle). " +
      "Écris la formule en LaTeX au tableau.",
    // Diagnostic : les notions d'avant qui bloquent cette étape (sec 3 et 1er cycle).
    "Notions d'avant typiques (sec 3) : la distributivité avec les signes (−2(x − 3) = −2x + 6) ; les termes semblables (3x + 2x² " +
      "ne s'additionnent pas) ; les lois des exposants (x² · x³ = x⁵, pas x⁶) ; la mise en évidence simple ; les carrés parfaits " +
      "(49, 64, 9x²) ; les facteurs d'un nombre (paires de facteurs de 30) ; les fractions numériques (PPCM, simplifier 12/18) pour " +
      "les expressions rationnelles. Soupçon → une question isolée avec des nombres simples (« Que vaut −2(x − 3) ? »).",
    "Exercices : coefficients entiers et petits, a × c au plus 60 en produit-somme, des trinômes qui se factorisent ; un piège " +
      "classique par séance au plus (signe, facteur commun oublié, restriction oubliée).",
  ],
};
