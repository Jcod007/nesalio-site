import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEACHING, VISUAL_DICTIONARY, exampleLessonText } from "./pedagogy";
import { PROMPT_EXAMPLES, buildNesalioMessages, buildNesalioSystemPrompt, consignesFromEnv, languageReference } from "./prompt";

/**
 * Empreinte du prompt complet au moment où la version allégée a été ajoutée
 * (2026-11-09, 36 984 caractères). Sans NESALIO_CONSIGNES, le prompt doit rester
 * celui-ci à l'octet près. Si le prompt complet est modifié VOLONTAIREMENT,
 * mettre à jour cette empreinte et sa taille dans le même changement.
 * Mise à jour VOLONTAIRE le 2026-11-09 (dev 2, consignes de justesse) : TEACHING reçoit « reformule les données de
 * l'élève », « corrige ce qui est faux », « calcul et résultat dans la même formule », « vérifie par substitution » ;
 * MATH_RULES annonce floor et ceil ; pour rester sous 37 000 caractères, sept règles de forme couvertes par le code
 * (identifiants, rôles de style, paramètre animé, accents des repères, objet effacé, redéclaration, trois lignes de
 * CHECKLIST) et la phrase « Les parties mises bout à bout… » quittent aussi la version complète. 36 984 → 36 914.
 * Mise à jour VOLONTAIRE le 2026-11-09 (relecteur) : MATH_RULES dit comment écrire table de valeurs, tableau d'atomes et
 * points nommés pour que le moteur les contrôle (phrases 1, 2, 4 de dev 1) ; « une formule fausse… pire erreur » (déjà
 * dans JUSTESSE) et l'exemple d'axes « x de -6 à 6… » retirés ; « répond » → « réponds ». 36 914 → 36 994.
 * Mise à jour VOLONTAIRE le 2026-11-10 (étiquette sur une partie de formule) : le format reçoit attachment.part et la
 * consigne des étiquettes l'annonce (« 2 mol » sous N₂) ; pour rester sous 37 000, le 2e exemple de move (rapprocher
 * deux objets) et la phrase « Le moteur recadre les cibles du cadrage telles qu'elles sont alors » partent. 36 994 → 36 978.
 * Mise à jour VOLONTAIRE le 2026-11-10 (questions à l'élève, demande de l'utilisateur) : le FORMAT DE SORTIE reçoit la
 * ligne {"question": …} (4 lignes) et TEACHING remplace « Tu ne poses aucune question… » par au plus deux questions de vérification ; la limite des deux versions passe de 37 000 à 37 500 caractères. 36 978 → 37 466.
 * Mise à jour VOLONTAIRE le 2026-11-10 : « désigner UN MORCEAU » cite aussi « UNE relation parmi plusieurs » (formule
 * « 2/1 = 2 et 3/3 = 1 » surlignée en entier) ; « pas toute la formule » part. 37 466 → 37 474.
 */
const FULL_PROMPT_SHA256 = "579accc406f7d0d9702b3377d9cd519c40e56d29dd3647c107d3a5cb89291d00";
const FULL_PROMPT_LENGTH = 37_474;

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("consignes du prompt système (NESALIO_CONSIGNES)", () => {
  it("le prompt complet, demandé par NESALIO_CONSIGNES=completes, est inchangé à l'octet près", () => {
    vi.stubEnv("NESALIO_CONSIGNES", "completes");
    const prompt = buildNesalioSystemPrompt();
    expect(prompt.length).toBe(FULL_PROMPT_LENGTH);
    expect(sha256(prompt)).toBe(FULL_PROMPT_SHA256);
    expect(buildNesalioSystemPrompt("completes")).toBe(prompt);
  });

  it("la version allégée est le défaut ; seule la valeur completes rend le prompt complet", () => {
    // Choix de l'utilisateur le 2026-11-09, après les mesures au banc Alloprof.
    expect(consignesFromEnv({})).toBe("allegees");
    expect(consignesFromEnv({ NESALIO_CONSIGNES: "" })).toBe("allegees");
    expect(consignesFromEnv({ NESALIO_CONSIGNES: "complètes" })).toBe("allegees");
    expect(consignesFromEnv({ NESALIO_CONSIGNES: "allegees" })).toBe("allegees");
    expect(consignesFromEnv({ NESALIO_CONSIGNES: "completes" })).toBe("completes");
    vi.stubEnv("NESALIO_CONSIGNES", undefined);
    expect(buildNesalioSystemPrompt()).toBe(buildNesalioSystemPrompt("allegees"));
  });

  it("la variable passe jusqu'aux messages envoyés au modèle", () => {
    vi.stubEnv("NESALIO_CONSIGNES", "completes");
    const [system, user] = buildNesalioMessages("Comment je résous 3x + 5 = 17 ?");
    expect(system!.content).toBe(buildNesalioSystemPrompt("completes"));
    vi.stubEnv("NESALIO_CONSIGNES", undefined);
    expect(buildNesalioMessages("Comment je résous 3x + 5 = 17 ?")[0]!.content).toBe(buildNesalioSystemPrompt("allegees"));
    // Le guide de la notion (message utilisateur) ne dépend pas de la version.
    expect(buildNesalioMessages("Comment je résous 3x + 5 = 17 ?")[1]).toEqual(user);
  });

  it("la version allégée retire les règles de forme couvertes par le code", () => {
    const light = buildNesalioSystemPrompt("allegees");
    expect(light.length).toBeLessThan(FULL_PROMPT_LENGTH);
    for (const removed of [
      "chaque cue.text est copié mot pour mot",
      "chaque action vise un objet déclaré ou un cadrage déjà sauvegardé",
      "aucun texte ni formule n'a de coordonnées",
      "Les identifiants : une lettre",
      "mêmes accents, même apostrophe",
      "Les parties mises bout à bout redonnent exactement content",
      "Une fraction ne se découpe JAMAIS",
      "n'ont JAMAIS de coordonnées",
      "Tu n'écris jamais de position",
      "sans les redéclarer",
      "Un objet effacé par remove ne peut plus être visé",
      "Pas de couleurs",
      "n'est jamais coupé entre deux parts",
      "un de plus titre les",
      "from et to restent dans les bornes",
    ])
      expect(light, removed).not.toContain(removed);
  });

  it("les deux versions portent les consignes de justesse et annoncent floor", () => {
    // Analyst, erreurs graves (2026-11-09): result written in another formula, no written check, the student's case
    // answered by a general rule, the partial integer function drawn without steps.
    for (const version of ["completes", "allegees"] as const) {
      const prompt = buildNesalioSystemPrompt(version);
      for (const rule of [
        "UN CALCUL ET SON RÉSULTAT DANS LA MÊME FORMULE",
        "VÉRIFIE LA RÉPONSE AU TABLEAU",
        "REFORMULER les données",
        "réponds d'abord à SON cas",
        "dis-le clairement et corrige-le",
        "floor, ceil (partie entière [x] = floor(x))",
        "Contrôlé par le moteur : table « x » / « f(x) »",
        "lignes « réactifs » et « produits »",
        "id sommet1, creux1, zero1",
      ]) {
        expect(prompt, `${version} : ${rule}`).toContain(rule);
      }
      expect(prompt.length, version).toBeLessThan(37_500);
    }
  });

  it("la version allégée garde la pédagogie, le fond, la mise en page de jugement et tous les exemples", () => {
    const light = buildNesalioSystemPrompt("allegees");
    for (const kept of [
      TEACHING,
      VISUAL_DICTIONARY,
      languageReference(),
      exampleLessonText(),
      ...PROMPT_EXAMPLES.map(({ slice }) => JSON.stringify({ slice })),
      "ce passage dit POURQUOI",
      "le tableau montre ce que dit ce passage",
      "chaque calcul est juste",
      "Vérifie chaque calcul que tu écris",
      "GARDE LE TABLEAU LISIBLE",
      "dim pour ce qui peut encore servir",
      "RÉCAPITULATIF FINAL",
      "écris les maths EN MOTS",
      "occurrence dit lequel",
      "chaque formule dite en plusieurs morceaux a ses parts",
      "ATTENTION : log est le logarithme en base 10",
      "au plus 24 unités de large",
      "sans $ autour",
      "jamais des label séparés",
    ])
      expect(light, kept.slice(0, 60)).toContain(kept);
  });
});
