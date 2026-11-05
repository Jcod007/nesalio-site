import { describe, expect, it } from "vitest";
import { matchChoice } from "./matchChoice";

const choices = ["5 cm", "7 cm", "25 cm"];

describe("matchChoice", () => {
  it("reconnaît le texte exact d'un choix, sans accents ni majuscules", () => {
    expect(matchChoice("7 CM", choices)).toBe(1);
    expect(matchChoice("Égal", ["egal", "different"])).toBe(0);
  });

  it("reconnaît la lettre ou le rang", () => {
    expect(matchChoice("b", choices)).toBe(1);
    expect(matchChoice("la troisième", choices)).toBe(2);
    expect(matchChoice("réponse a", choices)).toBe(0);
  });

  it("ignore un rang qui n'existe pas", () => {
    expect(matchChoice("d", choices)).toBeNull();
  });

  it("reconnaît un seul choix contenu dans la réponse", () => {
    expect(matchChoice("je pense que c'est 7 cm", choices)).toBe(1);
    // « 25 cm » contient aussi « 5 cm » : ambigu, donc réponse libre.
    expect(matchChoice("je pense que c'est 25 cm", choices)).toBeNull();
  });

  it("renvoie null pour une réponse libre ou ambiguë", () => {
    expect(matchChoice("je sais pas", choices)).toBeNull();
    expect(matchChoice("cm", choices)).toBeNull();
    expect(matchChoice("   ", choices)).toBeNull();
  });
});
