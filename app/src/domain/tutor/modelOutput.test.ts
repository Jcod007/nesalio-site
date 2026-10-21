import { describe, expect, it } from "vitest";
import { createModelOutputParser, JsonObjectScanner } from "./modelOutput";

describe("JsonObjectScanner", () => {
  it("retrouve les objets même découpés en morceaux, sur plusieurs lignes ou entourés de texte", () => {
    const scanner = new JsonObjectScanner();
    const text = 'Voici :\n```json\n{"kind":"lesson","title":"A {b}"}\n{"kind":"step",\n "say":"x \\" }",\n "do":[{"type":"note","text":"y"}]}\n```';
    const found: string[] = [];
    for (const ch of text.match(/.{1,7}/gs)!) found.push(...scanner.push(ch));
    expect(found).toHaveLength(2);
    expect(JSON.parse(found[0]!)).toEqual({ kind: "lesson", title: "A {b}" });
    expect(JSON.parse(found[1]!).say).toBe('x " }');
  });
});

describe("createModelOutputParser", () => {
  it("valide une étape complète", () => {
    const parser = createModelOutputParser();
    const event = parser.parseLine(
      JSON.stringify({
        kind: "step",
        say: "On trace la courbe.",
        mood: "dessine",
        do: [
          { type: "axes", x: [-1, 5], y: [-3, 4] },
          { type: "curve", id: "f", fn: "-(x-2)^2+3", color: "blue" },
        ],
      }),
    );
    expect(event).toMatchObject({ kind: "step", say: "On trace la courbe.", mood: "dessine" });
    expect(event?.kind === "step" && event.do).toHaveLength(2);
    expect(parser.issues).toHaveLength(0);
  });

  it("corrige les écarts courants : alias, identifiant manquant, kind oublié, {x,y}", () => {
    const parser = createModelOutputParser();
    const event = parser.parseLine(
      JSON.stringify({
        say: "Regarde.",
        do: [
          { type: "line", from: [0, 0], to: [1, 1] },
          { type: "dot", x: 1, y: 2, label: "A" },
        ],
      }),
    );
    expect(event?.kind).toBe("step");
    if (event?.kind !== "step") throw new Error();
    expect(event.do.map((a) => a.type)).toEqual(["segment", "point"]);
    expect(event.do[0]).toHaveProperty("id");
    expect(event.do[1]).toMatchObject({ at: [1, 2] });
  });

  it("garde la phrase quand une commande est invalide, et l'écarte", () => {
    const parser = createModelOutputParser();
    const event = parser.parseLine(
      JSON.stringify({
        kind: "step",
        say: "On garde la phrase.",
        do: [
          { type: "curve", id: "bad", fn: "alert(1)" },
          { type: "point", id: "ok", at: [0, 0] },
          { type: "teleport", id: "z" },
        ],
      }),
    );
    if (event?.kind !== "step") throw new Error();
    expect(event.do).toEqual([{ type: "point", id: "ok", at: [0, 0] }]);
    expect(parser.issues.length).toBe(2);
  });

  it("écarte une question de vérification incohérente sans perdre l'étape", () => {
    const parser = createModelOutputParser();
    const event = parser.parseLine(
      JSON.stringify({
        kind: "step",
        say: "Question.",
        check: { prompt: "?", choices: ["a", "b"], answer: 5, ifRight: "oui", ifWrong: "non" },
      }),
    );
    if (event?.kind !== "step") throw new Error();
    expect(event.check).toBeUndefined();
  });

  it("rejette le texte qui n'est pas du JSON", () => {
    const parser = createModelOutputParser();
    expect(parser.parseLine("Bien sûr, voici la réponse")).toBeNull();
    expect(parser.parseLine('{"kind":"weird"}')).toBeNull();
    expect(parser.parseLine('{"kind":"step","say":""}')).toBeNull();
  });
});

describe("tolérance aux textes un peu longs (séances du 19 octobre)", () => {
  it("garde un repère dont le nom d'axe est long, en le raccourcissant", () => {
    const parser = createModelOutputParser();
    const event = parser.parseLine(
      JSON.stringify({ kind: "step", say: "Le repère.", do: [{ type: "axes", x: [0, 4], y: [0, 9], xLabel: "nombre de doubles", yLabel: "valeur" }] }),
    );
    expect(event).toMatchObject({ kind: "step", do: [{ type: "axes", xLabel: "nombre de doubles" }] });
  });

  it("garde une fiche de diagnostic dont la notion est longue", () => {
    const parser = createModelOutputParser();
    const notion = "appliquer la règle complète d'une fonction (les deux gestes, pas seulement le premier), vue en sec 3";
    const event = parser.parseLine(JSON.stringify({ kind: "diagnosis", gaps: [{ notion, status: "suspected" }], strengths: [] }));
    expect(event).toMatchObject({ kind: "diagnosis", gaps: [{ status: "suspected" }] });
  });
});

describe("formules et étiquettes d'événement (séances du 21 octobre)", () => {
  it("double les barres obliques LaTeX oubliées dans le JSON", () => {
    const parser = createModelOutputParser();
    const line = String.raw`{"kind":"step","say":"L'aire, c'est la moitié.","do":[{"type":"note","id":"n","text":"aire = $\frac{b \times h}{2}$ ou $\sqrt{4}$"}]}`;
    const event = parser.parseLine(line);
    expect(event?.kind).toBe("step");
    const note = (event as { do: Array<{ text: string }> }).do[0]!;
    expect(note.text).toBe(String.raw`aire = $\frac{b \times h}{2}$ ou $\sqrt{4}$`);
  });

  it("dit la formule en clair dans la phrase", () => {
    const parser = createModelOutputParser();
    const event = parser.parseLine(String.raw`{"kind":"step","say":"Ça fait $\frac{3}{5}$.","do":[]}`);
    expect((event as { say: string }).say).toBe("Ça fait 3/5.");
  });

  it("accepte « type » à la place de « kind » pour une fiche de diagnostic", () => {
    const parser = createModelOutputParser();
    const event = parser.parseLine('{"type":"diagnosis","gaps":[{"notion":"fraction d\'un tour","status":"suspected"}]}');
    expect(event?.kind).toBe("diagnosis");
  });
});
