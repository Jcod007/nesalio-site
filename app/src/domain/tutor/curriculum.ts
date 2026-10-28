/** Petit catalogue explicite. Les autres sujets restent accessibles sans inventer de prérequis. */
export interface ConceptPlan {
  id: string;
  label: string;
  prerequisites: readonly string[];
  explain: string;
  example: string;
}

export const CONCEPTS: readonly ConceptPlan[] = [
  { id: "fractions.parts", label: "Sens d'une fraction", prerequisites: [],
    explain: "Partager un même tout en parts égales ; dénominateur = nombre total de parts, numérateur = parts prises.",
    example: "Partager un tout en quatre parts égales, en prendre trois et relier chaque nombre de 3/4 au dessin." },
  { id: "fractions.addition", label: "Additionner des fractions", prerequisites: ["fractions.parts"],
    explain: "On ne compte ensemble que des parts de même taille ; changer l'écriture conserve la quantité.",
    example: "Résoudre entièrement 1/2 + 1/3 : 3/6 + 2/6 = 5/6, avec le même tout et le sens de chaque transformation." },
  { id: "thales.configuration", label: "Configuration de Thalès", prerequisites: [],
    explain: "Identifier le sommet commun, les deux alignements, les deux segments parallèles et les sommets correspondants. Une histoire de rivière exige de relier chaque point au lieu réel et à la longueur cherchée ; sinon enseigner directement sur deux triangles.",
    example: "Construire un triangle SAB, D sur SA et E sur SB avec DE parallèle à AB. Nommer et montrer chacun des cinq points, puis les côtés correspondants SD/SA, SE/SB et DE/AB." },
  { id: "thales.ratios", label: "Utiliser les rapports de Thalès", prerequisites: ["thales.configuration"],
    explain: "Justifier les alignements et le parallélisme avant les rapports ; garder le même ordre petit/grand pour chaque paire de côtés.",
    example: "Avec SA=6, SD=2 et AB=9, expliquer SD/SA=DE/AB, puis DE=9×2/6=3. Distinguer SD/SA de SD/DA. La figure doit porter ces mêmes mesures." },
  { id: "functions.input-output", label: "Sens d'une fonction", prerequisites: [],
    explain: "Une fonction associe une unique sortie à chaque entrée autorisée ; définir entrée, règle et sortie avant les axes.",
    example: "Pour la règle doubler, résoudre entrée 3 → 3×2 → sortie 6, puis relier cette correspondance à (3,6) si les coordonnées sont nécessaires." },
  { id: "derivatives.slope", label: "Pente et variation", prerequisites: [],
    explain: "Distinguer hauteur et variation : pente = variation verticale / variation horizontale entre deux points.",
    example: "Pour x², P=(1,1) et Q=(3,9), calculer (9−1)/(3−1)=4 et relier chaque différence au dessin." },
  { id: "derivatives.local", label: "Sens local de la dérivée", prerequisites: ["derivatives.slope"],
    explain: "La dérivée mesure une variation locale ; rapprocher le second point fait tendre la sécante vers la tangente, sans confondre pente et hauteur. La tangente est une approximation linéaire locale : elle ne se confond pas avec toute la courbe. Au point confondu, on prend une limite ; on ne calcule pas 0/0.",
    example: "Pour x² en x=1, la pente de P(1,1)Q(q,q²) vaut q+1 : 4 pour q=3, 3 pour q=2, puis tend vers 2. La tangente y=2x−1 reste oblique. Toute annonce de déplacement doit correspondre aux commandes." },
];

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function findConcept(text: string): ConceptPlan | undefined {
  const t = normalize(text);
  let id: string | undefined;
  if (/\b(thales|tales)\b/.test(t)) id = "thales.ratios";
  else if (/\bderivee?s?\b|\bderivation\b/.test(t)) id = "derivatives.local";
  else if (/\bfractions?\b|\d+\s*\/\s*\d+\s*\+\s*\d+\s*\//.test(t)) id = /addition|additionne|somme|\+/.test(t) ? "fractions.addition" : "fractions.parts";
  else if (/\bfonction\b/.test(t) && /\b(sens|quoi|veut dire|debut|zero)\b/.test(t)) id = "functions.input-output";
  return CONCEPTS.find((c) => c.id === id);
}

export function conceptSequence(target: ConceptPlan): ConceptPlan[] {
  const visited = new Set<string>();
  const result: ConceptPlan[] = [];
  function visit(concept: ConceptPlan) {
    if (visited.has(concept.id)) return;
    visited.add(concept.id);
    for (const id of concept.prerequisites) {
      const prerequisite = CONCEPTS.find((c) => c.id === id);
      if (prerequisite) visit(prerequisite);
    }
    result.push(concept);
  }
  visit(target);
  return result;
}
