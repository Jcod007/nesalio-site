import type { TutorRequest } from "./request";

export interface TeachingPolicy {
  intent: "explanation" | "practice" | "remediation";
  scaffolding: "high" | "standard" | "light";
  questions: "defer" | "optional" | "requested";
  reason: string;
}

const normalize = (text: string): string =>
  text.normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'").toLowerCase().trim();

function declinesQuestions(text: string): boolean {
  return /\bsans (?:aucun(?:e)? )?(?:quiz|questions?|questionnaire|qcm|interrogation)\b/.test(text)
    || /\b(?:pas|plus|jamais) (?:de |d'|un |une |des |du )?(?:quiz|questions?|questionnaire|qcm|interrogation)\b/.test(text)
    || /\baucune? (?:quiz|questions?|questionnaire|qcm|interrogation)\b/.test(text)
    || /\bsans (?:me )?poser (?:de|des) questions?\b|\bsans m'interroger\b/.test(text)
    || /\b(?:evite|evitez) (?:de (?:me )?(?:poser|faire) )?(?:les|des|toute) questions?\b/.test(text)
    || /\bne m'interroge(?:z)? pas\b/.test(text)
    || /\bne me (?:teste|testez|questionne|questionnez) pas\b/.test(text)
    || /\bje ne veux pas que tu me poses? (?:des|de) questions?\b/.test(text);
}

function requestsWorkedExample(text: string): boolean {
  return /\bexercices? (?:deja |entierement )?(?:corrige|resolu|explique)s?\b/.test(text)
    || /\bexemples? (?:deja |entierement )?(?:travaille|corrige|resolu|commente)s?\b/.test(text);
}

/** Only explicit requests count; a worked example is teaching, not a quiz. */
function requestsPractice(text: string): boolean {
  return text.split(/[.!?;\n]+|\bmais\b/).some((clause) => {
    if (/\b(?:ne|n')\s*.*\b(?:veux|voudrais|souhaite|demande)\s+pas\b/.test(clause)
      || /\b(?:pas|plus|jamais|sans) (?:d[' ]|de |un |une |des |du )?(?:exercices?|quiz|qcm|questionnaire)\b/.test(clause)) return false;
    return /\b(?:teste|testez|interroge|interrogez|entraine|entrainez)[ -]moi\b/.test(clause)
      || /\b(?:pose|posez)[ -]moi (?:ensuite |apres )?(?:des|quelques|une) questions?\b/.test(clause)
      || /\b(?:peux|pourrais)[ -]tu (?:me tester|m'interroger|m'entrainer|me poser (?:des|quelques|une) questions?)\b/.test(clause)
      || /\b(?:laisse|laissez)[ -]moi (?:essayer|resoudre|faire)\b/.test(clause)
      || /\b(?:je (?:veux|voudrais|souhaite)|j'aimerais) m'entrainer\b/.test(clause)
      || (!requestsWorkedExample(clause) && (
        /\b(?:donne|donnez|propose|proposez|fais|faites)[ -]moi (?:un |des |quelques )?(?:exercices?|quiz|qcm|questionnaire)\b/.test(clause)
        || /\b(?:je (?:veux|voudrais|souhaite)|j'aimerais) (?:faire |avoir |resoudre )?(?:un |des |quelques )?(?:exercices?|quiz|qcm|questionnaire)\b/.test(clause)
        || /^(?:s'il te plait[, ]+)?(?:un|des|quelques) (?:exercices?|quiz|qcm|questionnaire)\b/.test(clause.trim())
      ));
  });
}

function needsExplanation(text: string): boolean {
  return /\bje (?:ne )?sais pas\b/.test(text)
    || /\b(?:aucune idee|pas compris|rien compris)\b/.test(text)
    || /\bje (?:ne )?comprends? (?:pas|rien)\b/.test(text);
}

function declaresNovice(text: string): boolean {
  return needsExplanation(text)
    || /\bje debute\b|\bje pars de zero\b|\bdepuis zero\b|\ba partir de zero\b/.test(text)
    || /\b(?:je suis|niveau) (?:un |une )?debutant(?:e)?\b/.test(text)
    || /\bje (?:ne )?(?:connais|maitrise) (?:absolument |vraiment |encore )?(?:rien|pas)\b/.test(text)
    || /\bje n'y connais (?:rien|pas)\b/.test(text)
    || /\bj[' ](?:y )?connais (?:rien|pas)\b/.test(text)
    || /\bje n'ai (?:aucune|pas de) (?:base|connaissance)s?\b/.test(text);
}

function declaresExperience(text: string): boolean {
  return /\bje (?:connais|maitrise|comprends) (?:deja |bien |tres bien )*(?:les bases|cette notion|ce concept)\b/.test(text)
    || /\bje suis (?:un |une )?expert(?:e)?\b/.test(text)
    || /\b(?:mon niveau est|j'ai un niveau|je suis de niveau|je suis) avance(?:e)?\b/.test(text);
}

/**
 * A cautious teaching preference, not a mastery score. Explicit wording may
 * guide the next turn; a correct multiple-choice answer never establishes expertise.
 * The model still interprets the learner's words and the mathematical context.
 */
export function resolveTeachingPolicy(request: TutorRequest): TeachingPolicy {
  // On continuation, question still contains the original question. The actual
  // new instruction (if any) is in the learner's answer.
  const current = normalize(request.mode === "continue" ? request.answer?.picked ?? "" : request.question);
  const original = normalize(request.context?.originalQuestion ?? (request.mode === "question" ? request.question : ""));
  const practiceRequested = requestsPractice(current);
  const workedExample = requestsWorkedExample(current) && !practiceRequested;
  const noQuestions = declinesQuestions(current) || (declinesQuestions(original) && !practiceRequested);
  const unsure = request.mode === "continue" && declaresNovice(current);
  const incorrect = request.mode === "continue" && request.answer?.correct === false;
  const remediation = unsure || incorrect;
  const intent: TeachingPolicy["intent"] = remediation ? "remediation"
    : workedExample ? "explanation" : practiceRequested || request.mode === "continue" ? "practice" : "explanation";
  const scaffolding: TeachingPolicy["scaffolding"] = remediation || declaresNovice(current) || declaresNovice(original)
    ? "high" : declaresExperience(current) || declaresExperience(original) ? "light" : "standard";

  if (noQuestions) return { intent, scaffolding, questions: "defer", reason: "L'élève demande une explication sans quiz ; respecter cette préférence avant de le solliciter." };
  if (unsure) return { intent, scaffolding, questions: "defer", reason: "L'élève ne sait pas répondre : enseigner et montrer un exemple avant toute nouvelle vérification." };
  if (practiceRequested) return { intent, scaffolding, questions: "requested", reason: "L'élève demande explicitement de s'entraîner ou d'être interrogé." };
  if (workedExample) return { intent, scaffolding, questions: "defer", reason: "L'élève demande un exemple travaillé : démontrer la résolution avant de lui proposer d'essayer." };
  if (incorrect) return { intent, scaffolding, questions: "optional", reason: "Réexpliquer l'erreur avec un exemple guidé ; une nouvelle question n'est pas obligatoire." };
  if (request.mode === "continue") return { intent, scaffolding, questions: "optional", reason: "Poursuivre à partir de la réponse sans imposer une question à chaque bloc ni déduire une maîtrise générale." };
  return { intent, scaffolding, questions: "defer", reason: request.mode === "followUp"
    ? "Répondre à la demande de clarification avant de revenir à une vérification."
    : "Commencer par une explication et un exemple ; ne pas exiger une prédiction avant l'enseignement." };
}
