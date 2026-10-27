import { describe, expect, it } from "vitest";
import { verifyNumericalClaims, verifyGeometryClaims } from "./mathClaims";

describe("numerical claims", () => {
  it("contrôle les expressions avec priorités et parenthèses", () => {
    expect(verifyNumericalClaims("2 + 3 * 4 = 14")).toBeUndefined();
    expect(verifyNumericalClaims("2 + 3 * 4 = 20")).toBeDefined();
    expect(verifyNumericalClaims("(2+3)*4 = 20")).toBeUndefined();
    expect(verifyNumericalClaims("(2+3)*4 = 14")).toBeDefined();
  });
  it("contrôle carrés et racines", () => {
    expect(verifyNumericalClaims("5² = 25")).toBeUndefined();
    expect(verifyNumericalClaims("5² = 24")).toBeDefined();
    expect(verifyNumericalClaims("√(49) = 7")).toBeUndefined();
    expect(verifyNumericalClaims("√(49) = 8")).toBeDefined();
  });
  it("n'invente pas de certitude pour une équation symbolique", () => {
    expect(verifyNumericalClaims("x² + 2x = 3")).toBeUndefined();
  });
  it("vérifie une affirmation explicite sur l'hypoténuse", () => {
    expect(verifyGeometryClaims("Pythagore : 3 et 4 donne 5")).toBeUndefined();
    expect(verifyGeometryClaims("Pythagore : 3 et 4 donne 6")).toBeDefined();
  });
});
