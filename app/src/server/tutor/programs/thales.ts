import type { Lesson, Step, StreamEvent } from "@/domain/scene/schema";
import type { TutorRequest } from "@/domain/tutor/request";
import { isHelpRequest, resolveTeachingPolicy } from "@/domain/tutor/teachingPolicy";
import { isGeneralProgramHelp, type TeachingProgram } from "@/domain/tutor/program";

/** Données communes à la figure, aux calculs, à la question et à sa correction. */
export const THALES_EXERCISES = [
  { sa: 6, sd: 2, ab: 9, sb: 6 },
  { sa: 8, sd: 2, ab: 12, sb: 8 },
  { sa: 10, sd: 4, ab: 15, sb: 10 },
  { sa: 12, sd: 3, ab: 8, sb: 12 },
] as const;

export function solveThales(exercise: { sa: number; sd: number; ab: number; sb?: number }): number {
  const { sa, sd, ab, sb } = exercise;
  if (![sa, sd, ab].every(Number.isFinite) || sa <= 0 || sd <= 0 || sd >= sa || ab <= 0
    || (sb !== undefined && (!Number.isFinite(sb) || sb <= 0 || ab >= sa + sb || ab <= Math.abs(sa - sb))))
    throw new Error("Configuration de Thalès invalide");
  return ab * sd / sa;
}

const number = (value: number) => String(Number(value.toFixed(6))).replace(".", ",");
const teaching = (concept: string, role: NonNullable<Step["teaching"]>["role"], completes = false) => ({ concept, role, completes });

function figure(index: number): Step[] {
  const { sa, sd, ab, sb } = THALES_EXERCISES[index]!;
  return [
    { say: `Voici le grand triangle SAB. Ses trois sommets sont S, A et B. SA mesure ${sa} cm et AB mesure ${ab} cm.`,
      do: [{ type: "clear" }, { type: "triangle", id: "tri", names: ["S", "A", "B"], lengths: { ab: sa, bc: ab, ca: sb }, sides: { ab: `SA = ${sa} cm`, bc: `AB = ${ab} cm` } },
        { type: "point", id: "dot-S", at: "S", color: "violet", ring: true },
        { type: "point", id: "dot-A", at: "A", color: "violet" }, { type: "point", id: "dot-B", at: "B", color: "violet" }],
      teaching: teaching("thales.configuration", "explanation") },
    { say: `Je place D sur le côté SA, à ${sd} cm de S. Ainsi, S, D et A sont alignés. SD mesure ${sd} cm ; le morceau DA mesure ${sa - sd} cm.`,
      do: [{ type: "construct", id: "D", kind: "divide", of: ["S", "A"], ratio: `${sd}:${sa - sd}` },
        { type: "segment", id: "SD", from: "S", to: "D", color: "green", label: `SD = ${sd} cm` }],
      teaching: teaching("thales.configuration", "explanation") },
    { say: "Par D, je construis la parallèle à AB. Elle coupe le côté SB au point E. S, E et B sont donc alignés ; DE est parallèle à AB par construction.",
      do: [{ type: "construct", id: "DE", kind: "parallel", of: ["A", "B"], through: "D", within: "tri", meets: "E", label: "DE" }],
      teaching: teaching("thales.configuration", "explanation") },
    { say: "Le petit triangle est SDE et le grand est SAB. Ils partagent le sommet S. D correspond à A, et E correspond à B : on compare des côtés qui occupent le même rôle.",
      do: [{ type: "polygon", id: "petit", points: ["S", "D", "E"], fill: true, color: "green" },
        { type: "note", id: "conditions", text: "S, D, A alignés · S, E, B alignés · DE ∥ AB" }],
      teaching: teaching("thales.configuration", "explanation", true) },
  ];
}

function workedExample(index: number): Step[] {
  const { sa, sd, ab } = THALES_EXERCISES[index]!;
  const result = solveThales(THALES_EXERCISES[index]!);
  return [
    { say: "Grâce aux alignements et au parallélisme, le théorème de Thalès donne trois rapports égaux. Je garde toujours le petit côté sur son grand côté correspondant.",
      do: [{ type: "note", id: "rapports", text: "$\\frac{SD}{SA} = \\frac{SE}{SB} = \\frac{DE}{AB}$" }], teaching: teaching("thales.ratios", "explanation", true) },
    { say: `On cherche DE. Les mesures connues donnent SD sur SA égal à ${sd} sur ${sa}, et DE sur AB égal à DE sur ${ab}.`,
      do: [{ type: "note", id: "substitution", text: `$\\frac{${sd}}{${sa}} = \\frac{DE}{${ab}}$` }], teaching: teaching("thales.ratios", "worked-example") },
    { say: `Pour obtenir DE, je multiplie le rapport ${sd} sur ${sa} par ${ab}. Cela donne ${ab} fois ${sd}, divisé par ${sa} : DE mesure ${number(result)} cm.`,
      do: [{ type: "note", id: "resultat", text: `$DE = ${ab} \\times \\frac{${sd}}{${sa}} = ${number(result)}\\text{ cm}$`, color: "green" }],
      teaching: teaching("thales.ratios", "worked-example") },
    { say: `Je vérifie : ${number(result)} sur ${ab} est égal à ${sd} sur ${sa}. Le petit côté DE est bien plus court que AB. Le résultat est cohérent avec la réduction.`,
      do: [{ type: "highlight", target: "resultat" }], teaching: teaching("thales.ratios", "worked-example", true) },
  ];
}

/** Autre représentation après des besoins d'aide répétés : le coefficient d'agrandissement. */
function scaleExample(index: number): Step[] {
  const { sa, sd, ab } = THALES_EXERCISES[index]!;
  const scale = sa / sd;
  const result = solveThales(THALES_EXERCISES[index]!);
  return [
    { say: `Changeons de chemin. Cherchons de combien on agrandit le petit triangle pour obtenir le grand : ${sa} divisé par ${sd} donne ${number(scale)}.`,
      do: [{ type: "highlight", target: "SD" }, { type: "note", id: "coefficient", text: `$k = \\frac{SA}{SD} = \\frac{${sa}}{${sd}} = ${number(scale)}$` }], teaching: teaching("thales.ratios", "explanation", true) },
    { say: `Chaque longueur du petit est multipliée par ${number(scale)}. SD devient SA. De la même manière, DE devient AB : ${ab} égale ${number(scale)} fois DE.`,
      do: [{ type: "note", id: "agrandissement", text: `$AB = ${number(scale)} \\times DE$` }], teaching: teaching("thales.ratios", "worked-example") },
    { say: `Pour retrouver le petit côté DE à partir du grand côté AB, on fait l'opération inverse. ${ab} divisé par ${number(scale)} donne ${number(result)} : DE mesure ${number(result)} cm.`,
      do: [{ type: "note", id: "resultat", text: `$DE = \\frac{${ab}}{${number(scale)}} = ${number(result)}\\text{ cm}$`, color: "green" }], teaching: teaching("thales.ratios", "worked-example") },
    { say: `C'est le même résultat qu'avec les rapports de Thalès. On peut soit multiplier ${ab} par ${sd} sur ${sa}, soit diviser ${ab} par le coefficient d'agrandissement ${number(scale)}.`,
      do: [{ type: "highlight", target: "resultat" }], teaching: teaching("thales.ratios", "worked-example", true) },
  ];
}

function repeatedHelp(request: TutorRequest): boolean {
  const observations = request.context?.learning?.concepts.find((c) => c.id === "thales.ratios")?.observations.slice(-2) ?? [];
  return observations.length === 2 && observations.every((o) => o.outcome === "help-requested" || o.outcome === "incorrect");
}

export function thalesLesson(): Lesson {
  return {
    header: { kind: "lesson", title: "Thalès : comprendre la figure et calculer une longueur", topic: "Thalès", goals: ["Identifier les cinq points et les deux triangles", "Justifier les conditions de Thalès", "Calculer DE avec les côtés correspondants"] },
    steps: [
      { say: "Notre objectif est de trouver une longueur sans la mesurer directement. Je construis d'abord la figure, puis je résous entièrement un exemple.", do: [], teaching: teaching("thales.configuration", "explanation") },
      ...figure(0),
      { say: "Pourquoi deux triangles ? Le parallélisme leur donne les mêmes angles : ils sont semblables. Le petit est une réduction du grand, donc toutes ses longueurs sont multipliées par le même rapport.", do: [{ type: "highlight", target: "petit" }], teaching: teaching("thales.configuration", "explanation", true) },
      ...workedExample(0),
      { say: "SD correspond à SA en entier, pas à DA. DA est seulement le morceau restant sur ce côté. Mélanger SD sur DA avec DE sur AB comparerait des morceaux qui n'ont pas le même rôle.", do: [], teaching: teaching("thales.ratios", "explanation", true) },
    ],
    end: { kind: "end", summary: ["Vérifier les alignements et le parallélisme", "Comparer les côtés correspondants dans le même ordre", "Ici : DE = 9 × 2 ÷ 6 = 3 cm"] },
  };
}

function practice(index: number): StreamEvent[] {
  const exercise = THALES_EXERCISES[index]!;
  const result = solveThales(exercise);
  const inverted = exercise.ab * exercise.sa / exercise.sd;
  const added = exercise.ab + exercise.sd;
  const values = [result, inverted, added];
  const answer = index % 3;
  const ordered = values.map((_, i) => values[(i - answer + 3) % 3]!);
  return [
    ...figure(index).map((step) => ({ kind: "step" as const, ...step })),
    { kind: "step", say: "La figure est construite avec les deux alignements et la parallèle. Cette fois, tu peux essayer le calcul avec le rapport petit sur grand.", do: [{ type: "note", id: "aide", text: "$\\frac{SD}{SA} = \\frac{DE}{AB}$" }],
      teaching: teaching("thales.ratios", "guided-practice"),
      check: { prompt: `SA = ${exercise.sa} cm, SD = ${exercise.sd} cm et AB = ${exercise.ab} cm. Que vaut DE ?`, choices: ordered.map((v) => `${number(v)} cm`), answer,
        ifRight: `Oui : DE = ${exercise.ab} × ${exercise.sd} ÷ ${exercise.sa} = ${number(result)} cm.`,
        ifWrong: "On reprend ensemble le sens du rapport et le calcul.",
        why: ordered.map((v) => v === result ? "" : v === inverted ? "rapport petit/grand inversé" : "addition de longueurs à la place d'un rapport") } },
    { kind: "await" },
  ];
}

function readNumber(text: string): number | null {
  const normalized = text.trim().replace(",", ".").replace(/\s*cm\.?$/i, "").trim();
  return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : null;
}

function generalThales(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return /\b(thales|tales)\b/.test(normalized)
    && !/\d|reciproque|contrapose|papillon|demonstration|demontre|prouve|preuve|biograph|naissance|milet|spherique|riviere|ombre|batiment|fleuve|mon exercice|cet enonce|cette figure|image jointe|rapid|vite|bref|resume|rappel/.test(normalized);
}

function wantsThisPractice(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  return generalThales(text)
    || normalized === "maintenant, propose-moi un exercice guide sur cette notion et laisse-moi essayer une etape."
    || /^(?:donne|propose|fais|prepare)[ -]moi (?:un |des )?exercices?(?: guides?)?[.!?]*$/.test(normalized);
}

/** Parcours borné et transparent : pas de substitution à un exercice personnel non reconnu. */
export function thalesProgramEvents(request: TutorRequest): StreamEvent[] | null {
  const policy = resolveTeachingPolicy(request);
  if (request.mode === "question" && generalThales(request.question) && policy.intent === "explanation" && policy.scaffolding !== "light") {
    const lesson = thalesLesson();
    return [{ kind: "source", source: "curriculum" }, { kind: "program", program: { id: "thales-v1", exercise: 0, phase: "explanation" } },
      lesson.header, ...lesson.steps.map((step) => ({ kind: "step" as const, ...step })), lesson.end];
  }
  const program = request.context?.program;
  if (!program || program.id !== "thales-v1") return null;
  if (request.mode === "followUp" && isGeneralProgramHelp(request.question)) {
    return [{ kind: "source", source: "curriculum" }, { kind: "program", program },
      ...figure(program.exercise).map((step) => ({ kind: "step" as const, ...step })),
      ...(repeatedHelp(request) ? scaleExample(program.exercise) : workedExample(program.exercise)).map((step) => ({ kind: "step" as const, ...step })),
      { kind: "end", summary: ["Les mêmes points et les mêmes mesures sont conservés", "On relie chaque calcul aux côtés correspondants"] }];
  }
  if (request.mode === "followUp" && policy.questions === "requested" && wantsThisPractice(request.question)) {
    const next: TeachingProgram = { ...program, exercise: (program.exercise + 1) % THALES_EXERCISES.length, phase: "practice" };
    return [{ kind: "source", source: "curriculum" }, { kind: "program", program: next }, ...practice(next.exercise)];
  }
  if (request.mode !== "continue" || program.phase !== "practice" || request.answer?.concept !== "thales.ratios") return null;
  const exercise = THALES_EXERCISES[program.exercise]!;
  const correct = !isHelpRequest(request.answer.picked) && readNumber(request.answer.picked) === solveThales(exercise);
  return [{ kind: "source", source: "curriculum" }, { kind: "program", program },
    { kind: "step", say: correct ? "Ton résultat est juste. Voici pourquoi ce calcul donne bien la longueur cherchée."
      : isHelpRequest(request.answer.picked) ? "Je te montre la résolution. Tu n'as pas besoin de deviner : chaque nombre va être relié à son côté."
        : "Reprenons le calcul ensemble. On compare d'abord chaque petit côté à son grand côté correspondant.", do: [], teaching: teaching("thales.ratios", "explanation") },
    ...(repeatedHelp(request) ? scaleExample(program.exercise) : workedExample(program.exercise)).map((step) => ({ kind: "step" as const, ...step })),
    { kind: "end", summary: [`DE = ${exercise.ab} × ${exercise.sd} ÷ ${exercise.sa} = ${number(solveThales(exercise))} cm`, "Le même ordre pour les côtés correspondants"] }];
}
