/**
 * Génération en deux temps (idée de l'utilisateur, 2026-11-08) : un premier appel,
 * « l'enseignant », écrit la leçon en texte simple, sans aucune syntaxe ; un
 * second, « le metteur en page », la traduit au format Nesalio v3.3 sans rien
 * changer à ce qui est dit. Le format JSON et le moteur ne changent pas.
 * Activé par NESALIO_DEUX_ETAPES=1 tant que la mesure n'a pas tranché.
 */
import type { ChatMessage } from "@/server/tutor/chatCompletions";
import { TEACHING, guideSection } from "./pedagogy";

const BOARD = `
CE QUE LE TABLEAU SAIT MONTRER (le metteur en page s'occupe de la place, de la caméra et du moment exact)
- des formules (LaTeX), des textes courts, des étiquettes attachées à un objet, des encadrés ;
- un repère (axes) avec des courbes y = f(x), des courbes paramétrées, des points, des segments, des flèches, des vecteurs,
  des cercles, des polygones (rectangles découpés en parts, carrés d'un modèle d'aire), un triangle rectangle, une droite graduée ;
- un tableau de valeurs avec un intitulé par ligne ;
- des gestes : écrire une formule morceau par morceau, surligner un objet ou un morceau de formule, estomper ou effacer,
  transformer une formule en la suivante (les morceaux communs glissent), déplacer un objet, cadrer un détail puis revenir,
  faire varier un paramètre (une courbe ou une droite qui bouge pendant qu'on parle).
Le tableau ne sait PAS : déplacer un point le long d'une courbe, dessiner à main levée, afficher une image.`.trim();

const SCRIPT_FORMAT = `
CE QUE TU ÉCRIS : le script de la leçon, en texte simple (pas de JSON), exactement sous cette forme :
IDÉE CENTRALE : une phrase.
TRANCHE 1 — but de la tranche
DIT : une phrase dite à voix haute (au plus 250 caractères), maths en mots (« deux x plus trois »).
TABLEAU : ce qui apparaît ou change pendant cette phrase, avec les nombres exacts et les formules en LaTeX entre $…$ ;
  « rien » si le tableau ne bouge pas.
DIT : …
TABLEAU : …
TRANCHE 2 — …
- 3 à 5 tranches de 2 à 5 passages (DIT + TABLEAU). La dernière tranche, et elle seule, est le récapitulatif : elle dit
  l'idée centrale et ce qui reste au tableau.
- Chaque nombre, chaque calcul et chaque point (avec son y calculé) est vérifié avant d'être écrit.
- Rien d'autre que le script : pas de titre en plus, pas de commentaire.`.trim();

export function buildTeacherMessages(question: string): ChatMessage[] {
  return [
    { role: "system", content: [TEACHING, BOARD, SCRIPT_FORMAT].join("\n\n") },
    {
      role: "user",
      content: [`Question de l'élève : « ${question.trim()} »`, guideSection(question), "Écris le script de la leçon."].filter(Boolean).join("\n\n"),
    },
  ];
}

/** What the layout writer is asked: the script, word for word, in the Nesalio format. */
export function layoutRequest(question: string, script: string): string {
  return [
    `Question de l'élève : « ${question.trim()} »`,
    guideSection(question),
    "SCRIPT DE L'ENSEIGNANT (déjà vérifié) :",
    script.trim(),
    [
      "Mets ce script au format Nesalio, sans changer l'explication :",
      "- la ligne lesson d'abord (title et learning_goal tirés du script, math_context avec les paramètres dont tu as besoin) ;",
      "- une tranche (slice) par TRANCHE du script, dans le même ordre ;",
      "- un passage (beat) par DIT : say reprend la phrase MOT POUR MOT ;",
      "- ce que dit TABLEAU devient des objets (introduces) et des gestes (do), chacun sur le repère du mot qui le nomme ;",
      "- n'ajoute aucune phrase, n'en retire aucune, ne change aucun nombre.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
