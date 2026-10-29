import { describe, expect, it } from "vitest";
import { arithmeticCheckViolation, assessAnswer, numericValue } from "./assessment";

const check = { choices: ["1/2", "2/3", "3/4"], answer: 2,
  verification: { kind: "arithmetic" as const, expression: "1/2+1/4" } };

describe("vérification arithmétique bornée", () => {
  it("recalcule un QCM et accepte une réponse libre numériquement exacte", () => {
    expect(arithmeticCheckViolation(check)).toBeNull();
    expect(assessAnswer(check, 2)).toEqual({ correct: true, method: "arithmetic" });
    expect(assessAnswer(check, "0,75")).toEqual({ correct: true, method: "arithmetic" });
    expect(assessAnswer(check, "2/7")).toEqual({ correct: false, method: "arithmetic" });
  });

  it("refuse un mauvais index et deux choix numériquement équivalents avant leur présentation", () => {
    expect(arithmeticCheckViolation({ ...check, answer: 0 })).toBeTruthy();
    const duplicate = { ...check, choices: ["3/4", "0.75"], answer: 0 };
    expect(arithmeticCheckViolation(duplicate)).toBeTruthy();
    expect(assessAnswer(duplicate, 0)).toEqual({ correct: null, method: "ungraded" });
  });

  it.each(["x+1", "1/0", "2^1024", "NaN", "Infinity", "globalThis.process.exit()", "__proto__", "2 mètres", "(1+2", "1 000", "1..2", "9007199254740993", "0.10000000000000001", "1".repeat(161)])(
    "ne calcule pas une expression non couverte : %s", (text) => expect(numericValue(text)).toBeNull(),
  );

  it("ne transforme ni une demande d'aide ni une réponse ambiguë en erreur", () => {
    for (const reply of ["Je ne sais pas", "3/4 ou 1/2", "environ 0,75", "x=0,75"])
      expect(assessAnswer(check, reply)).toEqual({ correct: null, method: "ungraded" });
  });

  it("conserve les QCM historiques et ne certifie pas leurs corrigés", () => {
    expect(assessAnswer({ choices: ["A", "B"], answer: 0 }, 0)).toEqual({ correct: true, method: "answer-key" });
    expect(assessAnswer({ choices: ["A", "B"] }, 0).correct).toBeNull();
    expect(assessAnswer({ choices: ["A", "B"], answer: 0 }, 12).correct).toBeNull();
  });

  it("ne confond pas un petit nombre non nul avec zéro", () => {
    const small = { choices: ["0", "1/10^20"], answer: 1, verification: { kind: "arithmetic" as const, expression: "1/10^20" } };
    expect(arithmeticCheckViolation(small)).toBeNull();
    expect(assessAnswer(small, "0").correct).toBe(false);
  });

  it("compare des fractions exactes, sans tolérance qui validerait une réponse voisine", () => {
    expect(numericValue("0,1+0,2")).toBe(0.3);
    const decimal = { choices: ["0.3", "0.300000000000001"], answer: 0,
      verification: { kind: "arithmetic" as const, expression: "0.1+0.2" } };
    expect(arithmeticCheckViolation(decimal)).toBeNull();
    expect(assessAnswer(decimal, 1).correct).toBe(false);
    expect(numericValue("2^-3")).toBe(0.125);
    expect(numericValue("0^0")).toBeNull();
  });
});
