import { describe, expect, it } from "vitest";
import { entryFor, initialState, MAX_ANSWERS, phaseInstruction, phaseLabel, stateFor } from "./pedagogy";

const answers = (...verdicts: Array<boolean | null>) => verdicts.map((correct) => ({ correct }));

describe("situer l'élève : découverte ou exercice", () => {
  it.each([
    ["C'est quoi la fonction partie entière ?", "decouverte"],
    ["C'est quoi la complétion du carré ? Par exemple avec x² + 6x − 7.", "decouverte"],
    ["Pourquoi (x + 5)² ce n'est pas x² + 25 ?", "decouverte"],
    ["Dans f(x) = 2[3(x − 1)] + 4, ça fait quoi le a, le b, le h et le k ?", "decouverte"],
    ["Comment calculer la portée d'un projectile ?", "decouverte"],
    ["Comment additionner 2 vecteurs ?", "decouverte"],
    ["Je comprends pas comment factoriser 3x² + 10x − 8.", "exercice"],
    ["Comment je divise 2x³ − 5x² − 4x + 3 par x − 3 ?", "exercice"],
    ["Comment je trouve les zéros de f(x) = 2[x − 1] − 4 ?", "exercice"],
    ["Un stationnement coûte 3 $ par heure commencée. Comment je trouve la règle de la fonction ?", "exercice"],
  ])("%s → %s", (question, entry) => {
    expect(entryFor(question)).toBe(entry);
  });
});

describe("parcours de découverte : montrer, guider, pratiquer", () => {
  const q = "C'est quoi la factorisation par produit-somme ?";

  it("commence par MONTRER un exemple résolu (pas de question de prédiction)", () => {
    expect(initialState(q)).toMatchObject({ phase: "montrer", part: 1 });
    expect(phaseInstruction(initialState(q))).toContain("EXEMPLE RÉSOLU");
    expect(phaseInstruction(initialState(q))).toContain("POURQUOI");
  });

  it("l'exemple se montre en deux tours, puis on fait ensemble, puis seul, puis on conclut", () => {
    expect(stateFor(q, answers(true)).phase).toBe("montrer");
    expect(stateFor(q, answers(true)).part).toBe(2);
    expect(stateFor(q, answers(true, true)).phase).toBe("guider");
    expect(stateFor(q, answers(true, true, true)).phase).toBe("pratiquer");
    expect(stateFor(q, answers(true, true, true, true)).phase).toBe("conclure");
  });

  it("deux erreurs d'affilée en faisant ensemble : on revient à un AUTRE exemple résolu", () => {
    const s = stateFor(q, answers(true, true, false, false));
    expect(s).toMatchObject({ phase: "montrer", part: 1, examples: 2 });
    expect(phaseInstruction(s)).toContain("AUTRE exemple");
    expect(phaseInstruction(s)).toContain("deux erreurs d'affilée");
  });

  it("une seule erreur en faisant ensemble : on reste à guider, en montrant ce qui cloche", () => {
    const s = stateFor(q, answers(true, true, false));
    expect(s.phase).toBe("guider");
    expect(phaseInstruction(s)).toContain("ce qui cloche");
  });

  it("seul, les indices montent d'un cran à chaque erreur, puis retour à un exemple", () => {
    const one = stateFor(q, answers(true, true, true, false));
    expect(one).toMatchObject({ phase: "pratiquer", hint: 1 });
    expect(phaseInstruction(one)).toContain("INDICE 1");
    expect(phaseInstruction(one)).toContain("JAMAIS la réponse finale");
    expect(stateFor(q, answers(true, true, true, false, false)).phase).toBe("montrer");
  });

  it("une réponse sans verdict (réponse libre) ne fait pas changer de phase, sauf avancer dans l'exemple", () => {
    expect(stateFor(q, answers(null)).part).toBe(2);
    expect(stateFor(q, answers(true, true, null)).phase).toBe("guider");
  });
});

describe("parcours d'exercice : situer, puis pratiquer avec indices", () => {
  const q = "Je comprends pas comment factoriser 3x² + 10x − 8.";

  it("commence par SITUER : ne pas résoudre, demander par où il commencerait", () => {
    const s = initialState(q);
    expect(s.phase).toBe("situer");
    expect(phaseInstruction(s)).toContain("Ne le résous pas");
  });

  it("il sait par où commencer : il fait SON exercice seul, étape par étape", () => {
    const s = stateFor(q, answers(true));
    expect(s.phase).toBe("pratiquer");
    expect(phaseInstruction(s)).toContain("SON exercice");
    expect(stateFor(q, answers(true, true)).phase).toBe("pratiquer");
    expect(stateFor(q, answers(true, true, true, true)).phase).toBe("conclure");
  });

  it("il ne sait pas par où commencer : un exemple semblable résolu, puis on revient à son exercice", () => {
    expect(stateFor(q, answers(false)).phase).toBe("montrer");
    expect(stateFor(q, answers(false, true, true)).phase).toBe("guider");
    expect(phaseInstruction(stateFor(q, answers(false, true, true, true)))).toContain("SON exercice");
  });
});

it("une séance longue se conclut", () => {
  const s = stateFor("C'est quoi un trinôme carré parfait ?", answers(...Array<boolean>(MAX_ANSWERS).fill(false)));
  expect(s.phase).toBe("conclure");
  expect(phaseLabel(s)).toBe("conclure");
});

describe("la phase arrive au modèle à chaque tour", () => {
  it("nouvelle question, réponse de l'élève, interruption", async () => {
    const { buildMessages, buildSystemPrompt } = await import("@/server/tutor/prompt");
    const first = buildMessages({ mode: "question", question: "C'est quoi la mise en évidence double ?" });
    expect(first[1]!.content).toContain("PHASE : MONTRER, début");

    const context = { spoken: [], board: [], originalQuestion: "C'est quoi la mise en évidence double ?", answers: [{ prompt: "Pourquoi ?", picked: "a", correct: true }] };
    const next = buildMessages({
      mode: "continue",
      question: "C'est quoi la mise en évidence double ?",
      context,
      answer: { prompt: "Pourquoi ?", choices: ["a", "b"], picked: "a", correct: true },
    });
    expect(next[1]!.content).toContain("PHASE : GUIDER");

    const follow = buildMessages({ mode: "followUp", question: "attends, pourquoi ?", context });
    expect(follow[1]!.content).not.toContain("PHASE :");

    // L'ancienne règle « question de prédiction au premier tour pour tout le monde » a disparu.
    expect(buildSystemPrompt()).not.toContain("puis une question de PRÉDICTION sur ce qui est au tableau");
    expect(buildSystemPrompt()).toContain("CHAQUE TOUR TE DONNE UNE PHASE");
  });
});
