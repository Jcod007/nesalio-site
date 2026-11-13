/**
 * Relecteur de fond : un second modèle (par défaut Claude Sonnet 5.5 sur AI Gateway)
 * relit chaque tranche avant qu'elle soit montrée, sauf une ouverture sans contenu (isPlainOpening). Il cherche les
 * seules erreurs de fond certaines (calcul, fait, tableau ou figure qui contredit,
 * énoncé mal lu, raisonnement qui se contredit). Une alerte ne compte que si sa
 * citation se retrouve mot pour mot dans la tranche ; la tranche est alors renvoyée
 * au modèle qui écrit (generator.ts) pour être corrigée.
 *
 * Mesuré hors ligne le 2026-11-09 (analyses/relecture, 90 leçons Alloprof) : 27 leçons
 * fautives sur 29 trouvées, 2 vraies fausses alertes sur 61, 2,5 s par leçon entière.
 * Activé par défaut (choix de l'utilisateur, 2026-11-09) : NESALIO_RELECTEUR=0 le coupe (config.ts, readReviewer).
 */
import type { MathContext, SceneObject, Slice } from "@/domain/nesalio/contract";
import { sceneText } from "@/domain/nesalio/measurement";
import { OPENING_TITLE_ID, escapeLatex, restoreLatex } from "@/domain/nesalio/normalize";
import type { ChatProvider } from "@/server/config";
import type { CompletionStream } from "@/server/tutor/chatCompletions";

export interface ReviewAlert {
  citation: string;
  correction: string;
  type: string;
}

export interface ReviewInput {
  question: string;
  /** Tranches déjà jouées, comme contexte : la relecture ne porte que sur `slice`. */
  previous: readonly Slice[];
  slice: Slice;
  /** Pour afficher les valeurs calculées comme l'élève les voit ; jamais envoyé lui-même au relecteur. */
  math?: MathContext;
  signal?: AbortSignal;
}

/** Ce que le relecteur a gardé, et ce qu'il a écarté (pour le journal). */
export interface ReviewResult {
  alerts: ReviewAlert[];
  dropped: { alert: ReviewAlert; reason: string }[];
  ms: number;
}

export type SliceReviewer = (input: ReviewInput) => Promise<ReviewResult>;

/** Objects that only carry words: an opening made of them has nothing a reviewer could find wrong. */
const WORD_TYPES: ReadonlySet<string> = new Set(["text", "label", "callout"]);
/** Digits (also sub/superscript, as in N₂) and spelled-out numbers: data a reviewer must check. "un" is left out (« un exemple »). */
const DATA =
  /[0-9₀-₉⁰¹²³⁴-⁹=%]|(?<![\p{L}])(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|cents|mille|million|milliard|moitié|demi|tiers|quart|double|triple)s?(?![\p{L}])/iu;

/**
 * The first tranche is shown at once only when it is a plain opening (2026-11-10, choice of the user):
 * words that restate the question and announce what comes, with no number, formula, table or figure.
 * Its voice gives the reviewer time to read the next tranche. Any first tranche carrying data is
 * reviewed like the others: on 2026-11-10 an unreviewed first tranche showed wrong coefficients.
 */
export function isPlainOpening(slice: Slice): boolean {
  const wordsOnly = slice.introduces.every((object) => {
    // The lesson's title, written by the engine on an empty opening: already shown in the top bar, not the model's data.
    if (object.id === OPENING_TITLE_ID) return true;
    const content = "content" in object ? object.content : undefined;
    return WORD_TYPES.has(object.type) && typeof content === "string" && !DATA.test(content);
  });
  if (!wordsOnly) return false;
  return slice.beats.every((beat) => !DATA.test(beat.say));
}

/** Au plus autant d'alertes renvoyées au modèle qui écrit. */
export const MAX_ALERTS = 4;
const MAX_TOKENS = 2_000;

export const REVIEW_SYSTEM = `Tu es relecteur scientifique pour un tuteur de maths et de chimie (secondaire 4-5, Québec).
On te donne la question d'un élève, les tranches de la leçon déjà montrées (CONTEXTE) et la NOUVELLE tranche : ce que la tutrice DIT (lignes « DIT ») et ce qu'elle affiche au tableau (lignes « OBJET » : formules, tableaux [matrix] avec rows/row_labels/column_labels, points, courbes, polygones, étiquettes).
Ta tâche : trouver dans la NOUVELLE tranche les ERREURS DE FOND CERTAINES, et seulement celles-là :
- calcul faux, comptage faux, valeur fausse ;
- fait scientifique ou définition faux ;
- tableau, figure, point ou étiquette qui contredit les nombres ou ce qui est dit (y compris dans le contexte) ;
- énoncé de l'élève mal lu, ou réponse qui ne répond pas à SA question ;
- raisonnement qui se contredit (la conclusion contredit le corps).
Refais toi-même chaque calcul avant de signaler, et vérifie avant d'écrire : n'écris jamais une alerte que tu retires ensuite. Ne signale PAS : le style, la pédagogie, un oubli, une simplification acceptable au secondaire, un arrondi raisonnable, un objet simplement mal placé, un doute, une erreur du CONTEXTE qui n'est pas reprise dans la nouvelle tranche. En cas de doute, ne signale rien. Une tranche juste doit recevoir une liste vide.
Réponds UNIQUEMENT en JSON, sans texte autour :
{"erreurs":[{"citation":"extrait exact copié de la NOUVELLE tranche","correction":"ce qui est juste, en une phrase","type":"calcul|fait|tableau|figure|enonce|raisonnement"}]}
Au plus ${MAX_ALERTS} erreurs, les plus graves d'abord. Liste vide si aucune erreur certaine : {"erreurs":[]}`;

/** Gestes gardés dans le texte relu : ceux qui changent ce qui est écrit ou montré. */
const KEPT_VERBS = new Set(["transform"]);

type Loose = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

/**
 * Le contenu d'un objet tel que l'élève le lit : une valeur calculée par le moteur
 * (`expression_ref` + `template`) est remplacée par le texte affiché ; sinon le relecteur
 * ne voyait que « {value} » et ne pouvait pas vérifier le nombre.
 */
function shownContent(object: Loose, math: MathContext | undefined): string {
  const content = object.content;
  if (!content || typeof content !== "object") return text(content);
  const computed = content as Loose;
  if (math && typeof computed.expression_ref === "string") {
    try {
      return `${sceneText(object as unknown as Extract<SceneObject, { type: "math" }>, new Map(), math)} (valeur calculée)`;
    } catch {
      /* expression with a parameter: the template is shown instead */
    }
  }
  return typeof computed.template === "string" ? computed.template : text(content);
}

/**
 * Une tranche en texte lisible : objets (contenu, tableaux, points, étiquettes attachées)
 * et ce qui est dit. Sans `math_context` (données internes jamais affichées : le relecteur
 * les prenait pour la leçon) ni gestes d'animation, sauf ceux qui changent le tableau.
 */
export function sliceText(slice: Slice, math?: MathContext): string {
  const s = slice as unknown as Loose;
  const out = [`=== Tranche ${text(s.slice_id)}`];
  for (const o of (s.introduces as Loose[] | undefined) ?? []) {
    const body = o.content !== undefined ? shownContent(o, math) : JSON.stringify(o.params ?? {});
    const parts = Array.isArray(o.parts) ? ` parts=${(o.parts as Loose[]).map((p) => text(p.text)).join(" | ")}` : "";
    const attached = o.attachment && typeof o.attachment === "object" ? ` attaché à ${text((o.attachment as Loose).parent)}` : "";
    out.push(`  OBJET ${text(o.id)} [${text(o.type)}] ${body}${parts}${attached}`);
  }
  for (const b of (s.beats as Loose[] | undefined) ?? []) {
    out.push(`DIT : ${text(b.say)}`);
    for (const d of (b.do as Loose[] | undefined) ?? []) {
      if (!KEPT_VERBS.has(String(d.verb))) continue;
      const rest: Loose = { ...d };
      for (const key of ["id", "verb", "target", "at"]) delete rest[key];
      out.push(`    ${text(d.verb)} ${text(d.target)} ${JSON.stringify(rest)}`);
    }
  }
  return out.join("\n");
}

export function reviewMessages(input: Pick<ReviewInput, "question" | "previous" | "slice" | "math">) {
  const context = input.previous.length ? input.previous.map((s) => sliceText(s, input.math)).join("\n") : "(aucune)";
  return [
    { role: "system" as const, content: REVIEW_SYSTEM },
    {
      role: "user" as const,
      content: `QUESTION DE L'ÉLÈVE :\n${input.question}\n\nCONTEXTE (tranches déjà montrées) :\n${context}\n\nNOUVELLE TRANCHE À RELIRE :\n${sliceText(input.slice, input.math)}`,
    },
  ];
}

/** Les objets JSON complets d'un texte, dans l'ordre (texte autour et clôtures ``` ignorés). */
function jsonObjects(raw: string): unknown[] {
  const found: unknown[] = [];
  for (let start = raw.indexOf("{"); start >= 0; start = raw.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    for (let index = start; index < raw.length; index++) {
      const char = raw[index];
      if (inString) {
        if (char === "\\") index++;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        const candidate = raw.slice(start, index + 1);
        // LaTeX à une seule barre oblique (`\sqrt`, `\cdot`) : objet illisible sans cette réparation.
        for (const attempt of [candidate, escapeLatex(candidate)]) {
          try {
            found.push(JSON.parse(attempt));
            start = index;
            break;
          } catch {
            /* réparation suivante, puis accolade suivante */
          }
        }
        break;
      }
    }
  }
  return found;
}

/**
 * Les alertes de la DERNIÈRE réponse JSON `{"erreurs": […]}` : sans réflexion, Sonnet écrit
 * parfois une première liste, puis « après vérification, je retire… » et `{"erreurs":[]}`
 * (4 réponses sur 90 dans l'essai hors ligne). `undefined` : aucune réponse lisible.
 */
export function parseReview(raw: string): ReviewAlert[] | undefined {
  const answers = jsonObjects(raw).filter(
    (value): value is { erreurs: unknown[] } => !!value && typeof value === "object" && Array.isArray((value as Loose).erreurs),
  );
  const last = answers.at(-1);
  if (!last) return;
  return last.erreurs.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { citation, correction, type } = item as Loose;
    if (typeof citation !== "string" || typeof correction !== "string") return [];
    // `\frac`, `\times`, `\neq` à une seule barre oblique sont lus saut de page, tabulation, retour à la ligne.
    const restore = (value: string) => restoreLatex(value) ?? value;
    return [{ citation: restore(citation).trim(), correction: restore(correction).trim(), type: typeof type === "string" ? type : "" }];
  });
}

/** Pour comparer une citation au texte : espaces, apostrophes, guillemets et barres obliques unifiés. */
export function comparable(value: string): string {
  return (
    value
      .normalize("NFC")
      .replace(/[‘’ʼ`´]/g, "'")
      // Guillemets retirés : « trois quarts » (espaces insécables) contre "trois quarts", ou \"…\" dans un tableau.
      .replace(/\\"|[“”«»"]/g, " ")
      .replace(/\{,\}/g, ",")
      .replace(/\\\\/g, "\\")
      .replace(/[\s  ]+/g, " ")
      .trim()
      .toLowerCase()
  );
}

/** Une correction qui se dédit (« c'est correct », « aucune vraie erreur ») : vu 5 fois dans l'essai hors ligne. */
const RETRACTION =
  /^(en fait,? )?(il n'y a )?(pas d'erreur|aucune (vraie |réelle )?erreur|ce n'est pas une erreur|rien à corriger|c'est (bien |donc )?(correct|juste)\b|(c'est )?déjà (juste|correct))/i;
/** Une correction qui continue après le dédit (« pas d'erreur de signe, mais le produit vaut 1,5 ») reste une alerte. */
const GOES_ON = /\bmais\b|\bpar contre\b|\bcependant\b/i;
/** Une citation plus courte se retrouve presque toujours dans une tranche. */
const MIN_CITATION = 4;

/**
 * Garde-fous : citation retrouvée mot pour mot dans le texte relu (pas dans le JSON brut, dont
 * les clés n'ont pas été montrées), correction qui ne se dédit pas, au plus MAX_ALERTS.
 */
export function screenAlerts(alerts: readonly ReviewAlert[], slice: Slice, math?: MathContext): Pick<ReviewResult, "alerts" | "dropped"> {
  const haystack = comparable(sliceText(slice, math));
  const kept: ReviewAlert[] = [];
  const dropped: ReviewResult["dropped"] = [];
  for (const alert of alerts) {
    const needle = comparable(alert.citation);
    if (needle.length < MIN_CITATION || !haystack.includes(needle)) dropped.push({ alert, reason: "citation introuvable dans la tranche" });
    else if (RETRACTION.test(comparable(alert.correction)) && !GOES_ON.test(alert.correction)) dropped.push({ alert, reason: "correction qui se dédit" });
    else if (kept.length >= MAX_ALERTS) dropped.push({ alert, reason: "au-delà du nombre d'alertes gardées" });
    else kept.push(alert);
  }
  return { alerts: kept, dropped };
}

/** Le relecteur branché sur un fournisseur : un appel par tranche, sans réflexion cachée. */
export function createSliceReviewer({ provider, completion }: { provider: ChatProvider; completion: CompletionStream }): SliceReviewer {
  return async ({ signal, ...input }) => {
    const started = Date.now();
    let raw = "";
    for await (const chunk of completion({
      protocol: provider.protocol,
      endpoint: provider.endpoint,
      apiKey: provider.apiKey,
      model: provider.model,
      extraHeaders: provider.extraHeaders,
      messages: reviewMessages(input),
      signal,
      maxTokens: MAX_TOKENS,
      ...(provider.reasoningEffort ? { reasoningEffort: provider.reasoningEffort } : {}),
    }))
      raw += chunk;
    const parsed = parseReview(raw);
    if (parsed === undefined) throw new Error(`réponse du relecteur illisible : ${raw.slice(0, 160)}`);
    return { ...screenAlerts(parsed, input.slice, input.math), ms: Date.now() - started };
  };
}
