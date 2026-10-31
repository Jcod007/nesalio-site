/**
 * Consignes du studio : le modèle écrit le script d'une vidéo TikTok verticale,
 * sans voix, dans le langage de scène de Nesa.
 *
 * Comme pour le tuteur, la spécification des commandes vient du registre et
 * l'exemple est une vraie vidéo du studio, sérialisée exactement comme le
 * modèle doit répondre.
 */
import { roseVideo } from "@/content/studioDemos";
import { commandReference } from "@/domain/scene/commands";
import type { StudioScript, VideoFormat } from "@/domain/studio/script";
import { MAX_SHOTS } from "@/domain/studio/script";
import type { ChatMessage } from "@/server/tutor/prompt";

export function serializeVideo(script: StudioScript): string {
  return [
    { kind: "lesson", title: script.title, hook: script.hook, music: script.music },
    ...script.shots.map((shot) => ({ kind: "step", say: shot.text, ...(shot.bars ? { bars: shot.bars } : {}), ...(shot.reveal ? { reveal: true } : {}), do: shot.do })),
    { kind: "end", cta: script.cta },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n");
}

const FORMAT_GUIDES: Record<VideoFormat, string> = {
  devine:
    "FORMAT « DEVINE CE QUE ÇA DESSINE » : on montre d'abord l'équation (rose polaire, cardioïde, cœur, papillon, " +
    "spirale, courbe de Lissajous…), le spectateur se demande ce qu'elle va dessiner, puis la courbe se trace " +
    "lentement (plan de révélation). Ensuite, on change UN nombre et la figure se transforme sous ses yeux. " +
    "Courbes en coordonnées polaires r(θ) : écris-les en paramétrique, x = r(t)·cos(t), y = r(t)·sin(t).",
  notion:
    "FORMAT « UNE NOTION EN 30 SECONDES » : une notion du secondaire ou du cégep (sec 4-5 au Québec), expliquée " +
    "par l'image : une intuition, le geste qui la montre, la formule à la fin. Le spectateur doit se dire « ah, c'est " +
    "juste ça ! ». Une seule idée, pas un cours.",
  physique:
    "FORMAT « LA PHYSIQUE CACHÉE » : la physique ou les maths derrière une chose du quotidien (le sport, la musique, " +
    "un jeu vidéo, un téléphone, la cuisine). On part de la chose concrète, on dessine le modèle, et la révélation " +
    "montre le lien. Exactitude d'abord : la gravité est constante, les forces partent du bon point, les unités sont justes.",
  libre: "FORMAT LIBRE : suis la demande telle quelle, avec les mêmes règles de rythme et de clarté.",
};

const SPEC = `
Tu écris le script d'une vidéo TikTok verticale de 15 à 45 secondes pour Nesalio (maths et sciences, Québec).
La vidéo n'a PAS de voix : de la musique, un tableau qui se dessine tout seul, et un court texte à l'écran par plan.
Ton public : des élèves de 14 à 18 ans qui font défiler leur fil. Tu as une seconde pour les arrêter.

FORMAT DE RÉPONSE
Tu réponds UNIQUEMENT par des objets JSON, un par ligne, sans texte autour ni bloc de code.
1. {"kind":"lesson","title":"…","hook":"…","music":"lofi|electro|epic"}
   - "hook" : l'accroche affichée en grand dès la première image (60 caractères au plus). Une question ou une
     promesse qui crée la curiosité (« Cette équation dessine… quoi ? », « Pourquoi ce lancer rentre à tous les
     coups »). Jamais « Bonjour », jamais « Aujourd'hui on va voir ».
   - "music" : "lofi" (calme, joli), "electro" (rapide, énergique), "epic" (montée dramatique vers une révélation).
2. {"kind":"step","say":"…","bars":2,"reveal":true,"do":[…]} : un PLAN de la vidéo.
   - "say" : le texte affiché à l'écran pendant le plan : 10 mots au plus, langage d'ado québécois correct, sans
     dollars ni LaTeX (« r = sin(4θ) », « 8 pétales ! »). Il complète l'image, il ne la décrit pas.
   - "bars" : durée du plan en mesures de musique (1 à 4 ; environ 2 secondes par mesure). Les plans courts gardent
     le rythme ; le plan de révélation dure 3 ou 4 mesures pour qu'on voie la figure se construire.
   - "reveal": true sur LE plan où arrive le moment fort (la courbe se dessine, la figure se transforme) : la
     musique monte juste avant et frappe à ce moment-là. Un seul, parfois deux.
   - "do" : les commandes de dessin du plan (1 à 3), jouées pendant le plan.
3. {"kind":"end","cta":"…"} : la phrase de fin (appel à l'action, 60 caractères au plus), suivie de nesalio.com.

LE SCÉNARIO DE L'AUTEUR
L'auteur écrit en texte libre : une simple idée, ou un scénario détaillé (plans, durées, musique, textes à l'écran).
- Scénario détaillé : suis-le FIDÈLEMENT. Un plan ("step") par moment qu'il décrit, dans son ordre, avec ses textes
  à l'écran s'il les donne (raccourcis seulement s'ils dépassent 10 mots). Sa musique décide "music" (calme, douce →
  "lofi" ; rapide, énergique → "electro" ; dramatique, montée → "epic"). Ses durées en secondes deviennent des
  mesures : environ 2 secondes par mesure ("3 secondes" → 2 mesures, "pendant 6 s" → 3 mesures). Le moment qu'il
  présente comme fort ou comme la révélation porte "reveal": true. Ce qu'il ne précise pas, tu le choisis selon les
  règles ci-dessous. Ce qui est impossible avec les commandes, remplace-le par le plus proche possible.
- Simple idée : écris tout le scénario toi-même.

RYTHME
- 4 à ${MAX_SHOTS - 2} plans. Le premier plan montre déjà quelque chose (une équation, une figure de départ).
- Chaque plan ajoute OU change quelque chose qu'on voit. Jamais deux plans qui se ressemblent.
- Montre le geste : une figure qui se transforme ("transform"), qui tourne ("rotate"), qui se déforme
  ("applyMatrix") retient plus qu'un nouveau dessin à côté.
- Finis sur une chute ou un défi (« Essaie avec 7 ! », « Et toi, tu l'avais vu ? »).
- Exactitude : les nombres affichés et dessinés concordent. Si tu simplifies, le texte le dit.
- La vidéo est verticale : préfère des figures plus hautes que larges ou carrées, centrées sur l'origine.
- Pas de "tag", pas de questions à choix ("check") : il n'y a personne pour répondre.

COMMANDES DE DESSIN (coordonnées mathématiques, couleurs : violet, blue, green, orange, ink, muted)
${commandReference()}
Les identifiants sont courts et uniques. Sans graphique, n'utilise pas d'axes. Formules au tableau ("text", "note",
"transform") : en LaTeX entre dollars, barres obliques inverses doublées comme partout en JSON ("$r = 3\\\\sin(4\\\\theta)$").
Une courbe paramétrée se trace avec "parametric" (expressions en t) ; l'animation la dessine du début à la fin de t.
`.trim();

/** Consignes complètes : le format, le guide du format choisi et l'exemple. Aussi données telles quelles à une autre IA. */
export function studioSystemPrompt(format: VideoFormat): string {
  return [SPEC, FORMAT_GUIDES[format], "EXEMPLE DE VIDÉO (format « devine ») :", serializeVideo(roseVideo)].join("\n\n");
}

export function buildStudioMessages(prompt: string, format: VideoFormat): ChatMessage[] {
  return [
    { role: "system", content: studioSystemPrompt(format) },
    { role: "user", content: `Scénario de l'auteur :\n${prompt.trim()}` },
  ];
}

export interface RevisionRequest {
  script: StudioScript;
  /** Rang du plan à refaire (à partir de 0). */
  shot: number;
  instruction: string;
  /** Ce qui est au tableau juste avant ce plan (identifiants réutilisables). */
  board: string[];
}

/** Refaire UN plan : le reste du script est donné tel quel, pour garder les mêmes identifiants. */
export function buildRevisionMessages(request: RevisionRequest, format: VideoFormat): ChatMessage[] {
  const { script, shot, instruction, board } = request;
  const later = script.shots
    .slice(shot + 1)
    .flatMap((s) => s.do)
    .flatMap((a) => Object.entries(a).filter(([key]) => ["target", "onto", "near", "of"].includes(key)).map(([, value]) => value))
    .filter((value): value is string => typeof value === "string");
  const user = [
    "Voici le script actuel de la vidéo :",
    serializeVideo(script),
    "",
    `Réécris SEULEMENT le plan n° ${shot + 1} (« ${script.shots[shot]?.text ?? ""} »), selon cette consigne de l'auteur :`,
    instruction.trim(),
    "",
    board.length > 0 ? `Au tableau juste avant ce plan :\n${board.map((line) => `- ${line}`).join("\n")}` : "Le tableau est vide juste avant ce plan.",
    later.length > 0 ? `Les plans suivants utilisent ces identifiants : ${[...new Set(later)].join(", ")}. Garde-les si ce plan les crée.` : "",
    'Réponds par UNE seule ligne JSON {"kind":"step",…} (deux au plus si la consigne demande de couper le plan en deux), rien d\'autre.',
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: studioSystemPrompt(format) },
    { role: "user", content: user },
  ];
}
