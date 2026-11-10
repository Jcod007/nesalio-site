/**
 * Prompt système du générateur Nesalio : il demande une explication au tableau,
 * au format Nesalio v3.3, et rien d'autre (pas de questions à l'élève, pas de
 * boucle pédagogique). La description du langage est produite à partir du
 * contrat : le prompt ne peut pas décrire un champ qui n'existe pas.
 */
import { MOVING_EXAMPLE_LESSON, REFUSAL_EXAMPLE, TEACHING, VISUAL_DICTIONARY, exampleLessonText, guideSection, lessonText } from "./pedagogy";
import { z } from "zod";
import { Action, NESALIO_FORMAT_VERSION, SceneObject } from "@/domain/nesalio/contract";
import type { ChatMessage } from "@/server/tutor/prompt";
import { PLAYABLE } from "@/engine/nesalioPlayback";

/** Accepted by the contract but read by no engine rule: offering them would mislead the model. */
const HIDDEN_FIELDS = new Set(["priority"]);

type JsonSchema = {
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
};

/** Compact, readable notation of a JSON Schema: `{ a: nombre, b?: "x" | "y" }`. */
export function describeSchema(schema: JsonSchema): string {
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) return variants.map(describeSchema).join(" | ");
  if (schema.prefixItems) return `[${schema.prefixItems.map(describeSchema).join(", ")}]`;
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case "object": {
      const required = new Set(schema.required ?? []);
      const fields = Object.entries(schema.properties ?? {})
        .filter(([key]) => !HIDDEN_FIELDS.has(key))
        .map(([key, value]) => `${key}${required.has(key) ? "" : "?"}: ${describeSchema(value)}${value.description ? ` « ${value.description} »` : ""}`);
      return `{ ${fields.join(", ")} }`;
    }
    case "array": {
      const bounds = schema.minItems !== undefined || schema.maxItems !== undefined
        ? ` (${schema.minItems ?? 0} à ${schema.maxItems ?? "∞"})` : "";
      return `${describeSchema(schema.items ?? {})}[]${bounds}`;
    }
    case "string": return schema.pattern ? "id" : "texte";
    case "integer": return "entier";
    case "number": return "nombre";
    case "boolean": return "booléen";
    default: return "valeur";
  }
}

function jsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
}

const COMMON_OBJECT_FIELDS = new Set(["id", "type", "priority", "size", "layout", "attachment", "style", "frame"]);
const COMMON_ACTION_FIELDS = new Set(["id", "verb", "at", "pace", "start", "end"]);

/** One line per object type and per verb, read from the contract itself, limited to what the player executes. */
export function languageReference(): string {
  const objects = SceneObject.options.filter((option) => PLAYABLE.objects.has(option.shape.type.value)).map((option) => {
    const schema = jsonSchema(option);
    const own = Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([key]) => !COMMON_OBJECT_FIELDS.has(key)));
    return `- ${option.shape.type.value} ${describeSchema({ type: "object", properties: own, required: schema.required })}`;
  });
  const common = jsonSchema(SceneObject.options[0]!).properties ?? {};
  const commonFields = [...COMMON_OBJECT_FIELDS].filter((key) => key !== "type" && !HIDDEN_FIELDS.has(key) && common[key])
    .map((key) => `${key}${key === "id" ? "" : "?"}: ${describeSchema(common[key]!)}${common[key]!.description ? ` « ${common[key]!.description} »` : ""}`);
  const actions = Action.options.filter((option) => PLAYABLE.actions.has(option.shape.verb.value)).map((option) => {
    const schema = jsonSchema(option);
    const own = Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([key]) => !COMMON_ACTION_FIELDS.has(key)));
    return `- ${option.shape.verb.value} ${describeSchema({ type: "object", properties: own, required: schema.required })}`;
  });
  return [
    "OBJETS (champs communs à tous : " + commonFields.join(", ") + ")",
    ...objects,
    "",
    "VERBES (chaque action a un id, et soit at, soit start + end ; pace? : \"quick\" | \"normal\" | \"slow\" avec at)",
    ...actions,
  ].join("\n");
}

/** How Nesa teaches: see pedagogy.ts (rules and guides taken back from the tutor). */
const ROLE = TEACHING;

const FORMAT = `
FORMAT DE SORTIE (format Nesalio ${NESALIO_FORMAT_VERSION}) : du JSON, une ligne par élément, rien d'autre (pas de texte, pas de \`\`\`).
- Ligne 1 : {"lesson": {"id", "title", "language": "fr", "learning_goal"}, "math_context": {"symbols": {...}, "expressions": {...}}}
- Puis UNE TRANCHE PAR LIGNE : {"slice": {"slice_id", "introduces": [objets], "groups"?: [groupes], "beats": [passages]}}
- 3 à 5 tranches (une seule tranche, 1 ou 2 passages, pour une question hors périmètre) ; 2 à 5 passages par tranche. Chaque ligne doit être un JSON complet et valide à elle seule.
- Un passage : {"id", "say", "cues": [repères], "do": [actions], "pause_after"?: "brief" | "normal" | "long"}.
  pause_after laisse un silence après le passage pour que l'élève regarde le tableau : "normal" après une idée importante
  ou un résultat, "long" avant de changer de partie ; sans pause_after, un court souffle sépare déjà les passages.
- Un repère : {"id", "text", "occurrence"?}. Un groupe : {"id", "items": [ids], "arrange"?: {"direction", "align"?, "gap"?}, "layout"?}.
- QUESTION À L'ÉLÈVE : juste après la ligne de la tranche de l'idée principale (une seconde fois au plus, jamais après
  le récapitulatif), une ligne {"question": {"id", "prompt", "choices": [2 à 4 choix courts], "answer": index du bon choix,
  "ifRight", "ifWrong", "why": [pour chaque choix, l'erreur qu'il révèle, "" pour le bon]}}. Elle vérifie que l'élève a
  compris (une prédiction, un calcul court), pas sa mémoire. La lecture attend sa réponse.
- math_context.symbols : {"nom": {"kind": "constant", "value"}} ou {"nom": {"kind": "parameter", "initial", "min", "max"}}.
  math_context.expressions : {"id": "expression"} pour les formules à valeur calculée.`.trim();

const SYNC_RULES = `
SYNCHRONISATION VOIX ↔ TABLEAU (règles strictes)
1. say est dit à voix haute : écris les maths EN MOTS (« deux x plus trois », « x au carré », « un demi »), pas en symboles ;
   de même pour la chimie et les unités (« H deux O », « donne » pour la flèche, « moles par litre »).
2. Un repère (cue.text) est un ou plusieurs MOTS ENTIERS copiés EXACTEMENT depuis say.
   Si le mot apparaît plusieurs fois, occurrence dit lequel (1 = le premier).
3. Le geste part au DÉBUT du mot du repère. Accroche chaque geste au mot qui NOMME ce qu'il montre :
   l'étiquette « a » sur le mot « a », pas sur un mot général dit avant (« les côtés »).
4. Une formule dite morceau par morceau se déclare avec parts et s'écrit partie par partie, chaque partie sur son mot :
   « neuf plus seize donne vingt-cinq » → parts 9 | + 16 | = 25, write part sur « neuf », « seize », « vingt-cinq ».
   Une fraction ne se découpe JAMAIS en numérateur et dénominateur : \\frac{3}{4} est une seule partie ; pour parler du
   numérateur puis du dénominateur, écris la fraction entière puis surligne-la (highlight).
5. Un tracé long (draw d'une courbe, animate_parameter) s'étale entre deux repères : start "cue:…", end "cue_end:…".
   Un highlight avec at est un éclair bref : pour que l'élève voie la partie surlignée pendant que tu en parles, donne start et end.
   Dans un matrix, highlight avec part « r2c3 » (case ligne 2, colonne 3), « r2 » (ligne) ou « c3 » (colonne), comptées
   depuis 1 sans les intitulés (highlight seulement).
   Pour désigner UN MORCEAU d'une formule (le x, un coefficient, un membre, UNE relation parmi plusieurs), découpe la
   formule en parts en prévoyant ce que tu vas désigner, puis highlight avec part : seule cette partie est surlignée.
6. beat:start seulement pour ce qui doit être là dès le début du passage (cadrage, titre).
7. after:id enchaîne une action à la fin d'une autre (surligner une formule juste après l'avoir écrite).
8. Le premier passage de la leçon est court (une phrase) : l'élève attend sa voix. Ensuite, une ou deux phrases par passage,
   environ 150 à 250 caractères.`.trim();

const LAYOUT_RULES = `
TABLEAU ET PLACEMENT
- Le tableau est infini : le moteur place chaque nouvelle composition dans une zone libre et déplace la caméra.
  Tu ne gères jamais la place disponible.
- Les figures (point, line, arrow, vector, circle, polygon, axes, function_graph, parametric_curve, number_line) d'une
  même tranche partagent un repère : donne leurs coordonnées mathématiques dans ce repère (un point en [1, 0] est sur
  l'axe des x à 1). Le moteur place le repère entier comme un bloc, à l'écart de ce qui est déjà au tableau.
- Une nouvelle idée (étape suivante, exemple, méthode, résumé) : NE lui donne PAS de layout ; le moteur la place sous
  la composition précédente. Réserve next_to à ce qui commente un objet précis (une note à côté de sa formule), et ne
  colle jamais un nouveau bloc à côté d'un élément au milieu d'une colonne d'étapes.
- Pour ajouter une figure à un repère d'une tranche précédente (un point sur une courbe déjà tracée), donne-lui
  "frame": id d'une figure de ce repère. Sans frame, une figure d'une nouvelle tranche ouvre un nouveau repère.
- Les textes et formules (text, label, callout, math, matrix) n'ont JAMAIS de coordonnées : place-les avec layout
  ({"next_to": id, "direction"}, {"align_to": id, "align"}, {"center_on": id}, {"to_edge": "left"}, {"to_corner": "top_left"})
  ou dans un groupe avec arrange. to_edge et to_corner se calculent par rapport à ce que voit l'élève à ce moment-là ;
  ensuite l'objet garde sa place sur le tableau.
- move déplace un objet déjà au tableau, avec ses étiquettes (des axes emportent leurs courbes et leurs points) :
  {"verb": "move", "target": id, "to": <même forme que layout>}. Exemples : ranger la formule clé dans un coin
  (to: {"to_corner": "top_left"}) pour libérer le centre. Déplace sur le mot qui annonce ce changement.
- Une étiquette se fixe à un objet avec attachment : {"parent": id, "anchor": "top" | "bottom" | "left" | "right" | "center"} ;
  "part" vise un morceau d'une formule en parts (« 2 mol » sous N₂).
  triangle_right a aussi ses côtés : "side_a" (le côté leg_a, horizontal), "side_b" (le côté leg_b, vertical) et
  "hypotenuse" ; la longueur d'un côté s'attache à son ancre. Un polygon n'a pas d'ancre de sommet : pose un point à ce
  sommet et attache-lui son label.
  Déclare dans la même tranche que leur parent les étiquettes que tu prévois.
- Tu n'écris jamais de position à l'écran ni de caméra : camera.focus dit QUOI cadrer, le moteur calcule le reste.
  Pour revenir à une vue d'ensemble après un détail, donne un nom unique avec save_as, puis utilise
  camera.restore avec frame égal à ce nom.
- Un objet déclaré reste invisible jusqu'à son action show, draw ou write. Il reste au tableau tant que tu ne le dégages pas.
  Les tranches suivantes peuvent réutiliser les objets déjà déclarés.
- GARDE LE TABLEAU LISIBLE : à l'écran, seulement ce qui sert à ce que tu dis. Quand tu passes à une autre idée, dégage
  ce dont tu ne parles plus, sur le mot qui marque le changement :
  dim pour ce qui peut encore servir (l'équation de départ pendant qu'on la résout, la figure qu'on commente) ;
  fade_out pour ce qui ne sert plus pour l'instant (show le fait revenir) ; remove pour ce qui ne servira plus du tout.
  Les deux libèrent la place : la tranche suivante peut s'installer au milieu de ce que voit l'élève si le centre est libre.
  Une tranche est placée au début de son premier passage :
  pour lui laisser la place, dégage dans le DERNIER passage de la tranche précédente.
  Les étiquettes attachées partent avec leur objet.
- RÉCAPITULATIF FINAL : UNE SEULE tranche de conclusion, la dernière, qui dit l'idée centrale et réécrit l'essentiel dans une composition courte,
  par exemple une règle et sa formule clé regroupées avec arrange. Fais apparaître cette composition pendant la
  dernière tranche et laisse-la visible jusqu'à la fin. Si tu utilises camera.focus, vise uniquement les objets du
  récapitulatif. Dans le DERNIER passage de la tranche qui précède le récapitulatif, ajoute dans do un fade_out ou
  remove pour chaque objet ou groupe encore au tableau qui ne sert plus. Les anciens calculs, figures et notes
  doivent avoir disparu avant que le moteur place le récapitulatif. Garde seulement ce que tu vas réutiliser.
- UNE SUITE DE CALCULS SUR LA MÊME FORMULE (résoudre, simplifier, développer, factoriser) : déclare chaque étape comme
  une formule (math) SANS layout, et passe de l'une à la suivante avec transform (source = l'étape au tableau,
  target = la nouvelle). La nouvelle étape prend la place de l'ancienne ; les morceaux communs glissent, le reste
  apparaît ou s'efface. N'empile les étapes (write l'une sous l'autre) que si l'élève doit les comparer.`.trim();

const MATH_RULES = `
MATHÉMATIQUES
- Formules (math.content, parts) : du LaTeX, sans $ autour. Chimie : \\ce{CH4 + 2O2 -> CO2 + 2H2O}, \\ce{N2 + 3H2 <=> 2NH3},
  \\ce{SO4^2-}, \\pu{12 g/mol} ; un \\ce{…} n'est jamais coupé entre deux parts.
- Expressions calculées (function_graph.expression, parametric_curve x et y, math_context.expressions) : grammaire restreinte,
  opérateurs + - * / ^, fonctions sqrt, abs, sin, cos, tan, exp, log, floor, ceil (partie entière [x] = floor(x)). ATTENTION : log est le logarithme en base 10 ;
  il n'existe pas de ln (écris log(x)/log(2.718281828) si tu en as besoin). Variable x pour function_graph, t pour parametric_curve,
  et les symboles déclarés dans math_context. Rien d'autre.
- Un tableau de valeurs : UN objet matrix avec row_labels (l'intitulé de chaque
  ligne, ex. « durée (h) ») et, si les colonnes ont un nom, column_labels (avec row_labels, un de plus titre les
  intitulés) ; jamais des label séparés. Cases : nombre, texte court (≤ 24 caractères : « 10 g », « ? ») ou null (vide).
- Évite les domaines où l'expression n'existe pas (log de 0 ou d'un négatif, division par 0) : choisis le domain en conséquence.
- Des axes doivent tenir à l'écran : au plus 24 unités de large (x) et 13 de haut (y).
  Une courbe qui sort de ses axes est coupée à leurs bords : choisis domain et axes pour que l'essentiel soit dedans.
- Vérifie chaque calcul que tu écris. Contrôlé par le moteur : table « x » / « f(x) » et sa règle f(x) = … écrite ;
  atomes : une colonne par symbole, lignes « réactifs » et « produits » ; id sommet1, creux1, zero1.`.trim();

/** Short tranches from different domains: they show the mechanics, not a lesson to imitate. */
export const PROMPT_EXAMPLES = [
  {
    title: "Une équation résolue sur place : formule en parties, puis transform vers l'étape suivante",
    slice: {
      slice_id: "s_equation",
      introduces: [
        { id: "eq", type: "math", content: "2x + 3 = 7", parts: [{ id: "left", text: "2x + 3" }, { id: "right", text: "= 7" }] },
        { id: "eq2", type: "math", content: "2x = 4" },
      ],
      beats: [
        { id: "pose", say: "Prenons deux x plus trois égale sept.", cues: [{ id: "lhs", text: "deux x plus trois" }, { id: "rhs", text: "égale sept" }],
          do: [{ id: "w_left", verb: "write", target: "eq", part: "left", at: "cue:lhs" }, { id: "w_right", verb: "write", target: "eq", part: "right", at: "cue:rhs" }] },
        { id: "retire", say: "On enlève trois des deux côtés : il reste deux x égale quatre.", cues: [{ id: "reste", text: "reste" }],
          do: [{ id: "t_eq", verb: "transform", source: "eq", target: "eq2", at: "cue:reste" },
            { id: "h_eq2", verb: "highlight", target: "eq2", role: "result", at: "after:t_eq" }] },
      ],
    },
  },
  {
    title: "Une courbe, le détail d'un point, puis le retour à la vue d'ensemble",
    slice: {
      slice_id: "s_parabole",
      introduces: [
        { id: "axes", type: "axes", params: { x: [-3, 3], y: [-1, 5] } },
        { id: "parabole", type: "function_graph", params: { expression: "x^2", domain: [-2, 2] }, style: { role: "accent" } },
        { id: "p1", type: "point", params: { at: [1, 1] } },
        { id: "p1_label", type: "label", content: "(1 ; 1)", attachment: { parent: "p1", anchor: "right" } },
      ],
      beats: [
        { id: "trace", say: "Voici la courbe de x au carré, une parabole.", cues: [{ id: "courbe", text: "courbe" }, { id: "parabole_mot", text: "parabole" }],
          do: [{ id: "cadre", verb: "camera.focus", targets: ["axes"], bounds: "layout_bounds", save_as: "vue_courbe", at: "beat:start" },
            { id: "a_axes", verb: "show", target: "axes", at: "beat:start" },
            { id: "d_parabole", verb: "draw", target: "parabole", start: "cue:courbe", end: "cue_end:parabole_mot" }] },
        { id: "point", say: "Quand x vaut un, x au carré vaut aussi un.", cues: [{ id: "x_un", text: "x vaut un" }, { id: "aussi_un", text: "vaut aussi un" }],
          do: [{ id: "detail", verb: "camera.focus", targets: ["p1"], bounds: "layout_bounds", at: "cue:x_un" },
            { id: "s_p1", verb: "show", target: "p1", at: "cue:x_un" }, { id: "s_label", verb: "show", target: "p1_label", at: "cue:aussi_un" }] },
        { id: "ensemble", say: "Puis revenons à la courbe entière.", cues: [{ id: "retour", text: "revenons" }],
          do: [{ id: "retablir", verb: "camera.restore", frame: "vue_courbe", at: "cue:retour" }] },
      ],
    },
  },
  {
    title: "Une figure, un groupe de textes placés à côté",
    slice: {
      slice_id: "s_angles",
      introduces: [
        { id: "tri", type: "polygon", params: { vertices: [[0, 0], [4, 0], [1, 3]] } },
        { id: "rule", type: "math", content: "\\alpha + \\beta + \\gamma = 180^\\circ",
          parts: [{ id: "angles", text: "\\alpha + \\beta + \\gamma" }, { id: "total", text: "= 180^\\circ" }] },
        { id: "note", type: "text", content: "Pour tout triangle" },
      ],
      groups: [{ id: "facts", items: ["rule", "note"], arrange: { direction: "down", align: "left" }, layout: { next_to: "tri", direction: "right", gap: "lg" } }],
      beats: [
        { id: "regle", say: "Dans un triangle, les trois angles additionnés font toujours cent quatre-vingts degrés.",
          cues: [{ id: "triangle", text: "triangle" }, { id: "angles_mot", text: "trois angles" }, { id: "degres", text: "cent quatre-vingts degrés" }],
          do: [{ id: "d_tri", verb: "draw", target: "tri", at: "cue:triangle" },
            { id: "w_angles", verb: "write", target: "rule", part: "angles", at: "cue:angles_mot" },
            { id: "w_total", verb: "write", target: "rule", part: "total", at: "cue:degres" }] },
        { id: "toujours", say: "Et ça marche pour tous les triangles, peu importe leur forme.", cues: [{ id: "tous", text: "tous les triangles" }],
          do: [{ id: "s_note", verb: "show", target: "note", at: "cue:tous" }, { id: "h_rule", verb: "highlight", target: "rule", role: "accent", at: "after:s_note" }] },
      ],
    },
  },
] as const;

const CHECKLIST = `
AVANT D'ÉCRIRE CHAQUE LIGNE, VÉRIFIE :
- ce passage dit POURQUOI (une justification, pas seulement une opération), et la leçon avance vers l'idée centrale ;
- le tableau montre ce que dit ce passage ;
- chaque formule dite en plusieurs morceaux a ses parts, et chaque part est écrite sur son mot ;
- avant une nouvelle idée, ce dont tu ne parles plus est estompé (dim) ou dégagé (fade_out, remove). Si la prochaine
  tranche est le récapitulatif, vérifie dès maintenant les fade_out ou remove dans le do de ce dernier passage ;
- chaque calcul est juste, écrit avec son résultat dans la même formule, et la réponse finale est vérifiée au tableau.`.trim();

/**
 * Version du prompt système. « allegees » (défaut depuis le 2026-11-09, choix de l'utilisateur) :
 * sans les règles de pure forme que le code répare (normalize.ts) ou refuse avec un message précis
 * (validate.ts, contract.ts, coherence.ts, sayShow.ts) ; elle a fait mieux partout où on l'a mesurée
 * au banc (leçons intactes, note à l'aveugle), et le relecteur a été mesuré avec elle.
 * « completes » (NESALIO_CONSIGNES=completes) : le prompt avec toutes les règles, gardé pour comparer.
 */
export type Consignes = "completes" | "allegees";

export function consignesFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): Consignes {
  return env.NESALIO_CONSIGNES?.trim() === "completes" ? "completes" : "allegees";
}

/**
 * Passages retirés dans la version allégée : [texte exact, remplacement].
 * Chaque passage doit exister tel quel, sinon `lighten` échoue (un test le vérifie) :
 * une règle réécrite dans la version complète ne reste pas en silence dans l'allégée.
 * Le code qui couvre chaque passage : rapport consignes-allegees (side-session-notes).
 */
const LIGHT_REMOVALS: Readonly<Record<"FORMAT" | "SYNC_RULES" | "LAYOUT_RULES" | "MATH_RULES" | "CHECKLIST", readonly (readonly [string, string])[]>> = {
  FORMAT: [],
  SYNC_RULES: [
    ["\n   Une fraction ne se découpe JAMAIS en numérateur et dénominateur : \\frac{3}{4} est une seule partie ; pour parler du\n   numérateur puis du dénominateur, écris la fraction entière puis surligne-la (highlight).", ""],
    [" sans les intitulés (highlight seulement).", " sans les intitulés."],
  ],
  LAYOUT_RULES: [
    [" n'ont JAMAIS de coordonnées : place-les avec layout", " se placent avec layout"],
    ["- Tu n'écris jamais de position à l'écran ni de caméra : camera.focus", "- camera.focus"],
  ],
  MATH_RULES: [
    [" ; un \\ce{…} n'est jamais coupé entre deux parts.", "."],
    [" column_labels (avec row_labels, un de plus titre les\n  intitulés) ;", " column_labels ;"],
  ],
  CHECKLIST: [],
};

function lighten(section: keyof typeof LIGHT_REMOVALS, text: string): string {
  return LIGHT_REMOVALS[section].reduce((current, [removed, replacement]) => {
    if (current.split(removed).length !== 2) throw new Error(`Consignes allégées : passage introuvable ou ambigu dans ${section} : « ${removed.trim().slice(0, 60)}… »`);
    return current.replace(removed, () => replacement);
  }, text);
}

export function buildNesalioSystemPrompt(consignes: Consignes = consignesFromEnv()): string {
  const light = consignes === "allegees";
  const section = (name: keyof typeof LIGHT_REMOVALS, text: string) => light ? lighten(name, text) : text;
  const examples = PROMPT_EXAMPLES.map(({ title, slice }) => `Exemple — ${title} :\n${JSON.stringify({ slice })}`);
  return [
    ROLE, VISUAL_DICTIONARY, section("FORMAT", FORMAT), "LANGAGE NESALIO (généré depuis le contrat)", languageReference(),
    section("SYNC_RULES", SYNC_RULES), section("LAYOUT_RULES", LAYOUT_RULES), section("MATH_RULES", MATH_RULES),
    "EXEMPLES DE TRANCHES (des mécanismes à reprendre, pas des leçons à copier)", ...examples,
    "EXEMPLE DE LEÇON COMPLÈTE (pour le fil, la justification et le ton ; ne copie pas son sujet)", exampleLessonText(),
    "EXEMPLE DE LEÇON OÙ LA FIGURE BOUGE (un paramètre animé, une valeur calculée qui suit, des points calculés)", lessonText(MOVING_EXAMPLE_LESSON),
    "EXEMPLE DE LEÇON DE REFUS (question hors périmètre : une seule tranche)", lessonText(REFUSAL_EXAMPLE),
    section("CHECKLIST", CHECKLIST),
  ].join("\n\n");
}

export function buildNesalioMessages(question: string): ChatMessage[] {
  return [
    { role: "system", content: buildNesalioSystemPrompt() },
    // The guide of the question's notion goes with the question: the system prompt stays the same for every question.
    { role: "user", content: [`Question de l'élève : « ${question.trim()} »`, guideSection(question), "Écris l'explication au format Nesalio."]
      .filter(Boolean).join("\n\n") },
  ];
}

/** Fixed id of the one tranche of the refusal lesson. */
const REFUSAL_SLICE = REFUSAL_EXAMPLE.slices[0].slice_id;

/**
 * Message sent back once when a tranche is refused: the exact issues, and only that tranche to rewrite.
 * `lineShown`: the refused line ends the model's previous answer (generator.ts), to be edited, not rewritten from memory.
 */
export function repairMessage(sliceId: string, issues: readonly { path: readonly PropertyKey[]; message: string }[], lineShown = false): string {
  const lines = issues.slice(0, 12).map(({ path, message }) => `- ${path.map(String).join(".")} : ${message}`);
  const rewrite = lineShown
    ? "Ta ligne refusée est ci-dessus : recopie-la en ne changeant que les champs cités, sur une ligne {\"slice\": …}"
    : "Réécris cette tranche corrigée, sur une ligne {\"slice\": …}";
  // The refusal lesson has one tranche by design (pedagogy.ts, REFUSAL_EXAMPLE): nothing follows it.
  if (sliceId === REFUSAL_SLICE) return [
    `La tranche « ${sliceId} » a été refusée par le moteur :`,
    ...lines,
    `${rewrite} : c'est la seule tranche de la leçon de refus, n'écris rien après.`,
  ].join("\n");
  return [
    `La tranche « ${sliceId} » a été refusée par le moteur :`,
    ...lines,
    `${rewrite}, sans réécrire les tranches déjà acceptées.`,
    "Puis écris TOUTES les tranches qui devaient la suivre, jusqu'à la fin de la leçon (3 à 5 tranches en tout) ;",
    "ne t'arrête après elle que si c'était la dernière.",
  ].join("\n");
}

/**
 * Last chance for a tranche refused past its budget (generator.ts, once per lesson): the same
 * fault had come back after each correction, so the model is asked to drop what it cannot get
 * right instead of fixing it again.
 */
export function simplifyMessage(sliceId: string, issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  return [
    `La tranche « ${sliceId} » est refusée, et les corrections permises pour cette leçon sont épuisées :`,
    ...issues.slice(0, 6).map(({ path, message }) => `- ${path.map(String).join(".")} : ${message}`),
    "Dernier essai : réécris-la PLUS SIMPLE, même slice_id, sur une ligne {\"slice\": …}. Garde ce que tu expliques,",
    "mais retire ou remplace l'objet ou le geste fautif : un tableau devient une formule ou une phrase, un surlignage",
    "difficile est retiré, une valeur calculée est écrite comme une formule ordinaire.",
    "Puis écris toutes les tranches qui devaient la suivre, jusqu'à la fin de la leçon.",
  ].join("\n");
}

/**
 * Message sent when the reviewer (review.ts) found errors of substance in a tranche: the
 * tranche, shown above, is corrected on those points only, then the lesson goes on.
 */
export function reviewFixMessage(sliceId: string, alerts: readonly { citation: string; correction: string }[]): string {
  return [
    `Un relecteur a trouvé des erreurs de fond dans la tranche « ${sliceId} » (pas encore montrée à l'élève) :`,
    ...alerts.map(({ citation, correction }) => `- « ${citation} » → ${correction}`),
    "Refais d'abord toi-même chaque calcul cité. Ta tranche est ci-dessus : recopie-la sur une ligne {\"slice\": …}, même slice_id,",
    "en corrigeant ces erreurs partout où elles apparaissent (voix, formules, tableaux, figures, étiquettes) et rien d'autre.",
    "Puis écris TOUTES les tranches qui devaient la suivre, jusqu'à la fin de la leçon, cohérentes avec la correction ;",
    "ne t'arrête après elle que si c'était la dernière.",
  ].join("\n");
}

/** Message sent once when the model stopped before the lesson had its fewest tranches. */
export function continueMessage(accepted: readonly string[]): string {
  if (accepted.includes(REFUSAL_SLICE)) return "La leçon de refus n'a qu'une seule tranche : elle est complète, n'écris rien de plus.";
  return [
    `La leçon n'a que ${accepted.length} tranche(s) (${accepted.join(", ")}) : il en faut 3 à 5.`,
    "Continue : écris les tranches suivantes, une par ligne {\"slice\": …}, jusqu'au récapitulatif, sans réécrire celles-ci.",
  ].join("\n");
}

/**
 * Message sent back when the lesson line is refused or never arrived: without
 * it no tranche can be played, so the model starts over from that line.
 */
export function repairHeaderMessage(reason: "invalid" | "missing", issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  const lines = issues.slice(0, 12).map(({ path, message }) => `- ${path.length ? `${path.map(String).join(".")} : ` : ""}${message}`);
  return [
    reason === "invalid" ? "La ligne {\"lesson\": …} a été refusée par le moteur :" : "La ligne {\"lesson\": …} manque ou est illisible :",
    ...lines,
    "Écris d'abord la ligne {\"lesson\": …, \"math_context\": …} corrigée, en un seul objet JSON complet sur une ligne (vérifie que chaque { a son }),",
    "puis toutes les tranches, une par ligne.",
  ].join("\n");
}
