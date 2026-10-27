/**
 * Transforme le texte brut du modèle en événements validés.
 *
 * Les modèles se trompent parfois de forme : bloc ```json autour de la
 * réponse, identifiant oublié, « line » au lieu de « segment »… On corrige ce
 * qui est sans ambiguïté, on valide tout le reste, et on écarte ce qui ne
 * passe pas. Une commande invalide est retirée sans perdre la phrase de
 * l'étape : l'élève entend l'explication même si un tracé manque.
 */
import { ACTION_ALIASES, COMMANDS, NODE_COMMANDS, type ActionType } from "@/domain/scene/commands";
import {
  Action,
  Check,
  DiagnosisEvent,
  EndEvent,
  LessonHeaderEvent,
  Mood,
  type ModelEvent,
  type Step,
} from "@/domain/scene/schema";
import { z } from "zod";
import { extractCues, inferCues } from "./cues";
import { plainText } from "@/domain/board/tex";
import { TeachingAnnotation } from "./learning";

/** Noms de commandes que les modèles inventent : ceux du registre, plus quelques synonymes de type. */
const TYPE_ALIASES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.keys(COMMANDS).map((type) => [type.toLowerCase(), type])),
  ...ACTION_ALIASES,
};

export interface ParseIssue {
  line: string;
  reason: string;
}

export interface ModelOutputParser {
  /** Analyse une ligne. Renvoie l'événement validé, ou `null` si la ligne est écartée. */
  parseLine(line: string): ModelEvent | null;
  readonly issues: readonly ParseIssue[];
}

export function createModelOutputParser(): ModelOutputParser {
  const issues: ParseIssue[] = [];
  let autoId = 0;
  const nextId = (type: string) => `${type}${++autoId}`;

  const reject = (line: string, reason: string) => {
    issues.push({ line: line.slice(0, 200), reason });
    return null;
  };

  function normalizeAction(raw: unknown): unknown {
    if (!raw || typeof raw !== "object") return raw;
    const action = { ...(raw as Record<string, unknown>) };
    if (typeof action.type === "string") {
      const type = action.type.toLowerCase();
      action.type = TYPE_ALIASES[type] ?? action.type;
    }
    if (typeof action.type === "string" && NODE_COMMANDS.has(action.type as ActionType) && typeof action.id !== "string") {
      action.id = nextId(action.type);
    }
    // Étiquette vide dans un objet d'étiquettes ("sides":{"ab":""}, vu le 21 octobre) : « pas d'étiquette »,
    // plutôt que tout le triangle refusé.
    for (const [key, value] of Object.entries(action)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const kept = Object.entries(value as Record<string, unknown>).filter(([, v]) => !(typeof v === "string" && v.trim() === ""));
      action[key] = Object.fromEntries(kept);
    }
    // { x, y } au lieu de at: [x, y]
    if (action.type === "point" || action.type === "text") {
      if (!Array.isArray(action.at) && typeof action.x === "number" && typeof action.y === "number") {
        action.at = [action.x, action.y];
        delete action.x;
        delete action.y;
      }
    }
    return action;
  }

  function parseStep(obj: Record<string, unknown>, line: string): ModelEvent | null {
    // La voix et les sous-titres disent la formule en clair (« $\\frac{3}{5}$ » devient « 3/5 »).
    const cued = typeof obj.say === "string" ? extractCues(plainText(obj.say)) : null;
    const say = z.string().trim().min(1).max(320).safeParse(cued?.say);
    if (!say.success) return reject(line, "Étape sans phrase valide");

    const rawActions = Array.isArray(obj.do) ? obj.do : [];
    const actions: Action[] = [];
    for (const raw of rawActions.slice(0, 12)) {
      const parsed = Action.safeParse(normalizeAction(raw));
      if (parsed.success) actions.push(parsed.data);
      else issues.push({ line: JSON.stringify(raw).slice(0, 200), reason: parsed.error.issues[0]?.message ?? "Commande invalide" });
    }

    const mood = Mood.safeParse(obj.mood);
    const check = obj.check === undefined ? undefined : Check.safeParse(obj.check);
    const teaching = TeachingAnnotation.safeParse(obj.teaching);
    if (check && !check.success) issues.push({ line: JSON.stringify(obj.check).slice(0, 200), reason: "Question de vérification invalide" });

    const step: Step = {
      say: say.data,
      mood: mood.success ? mood.data : undefined,
      do: actions,
      check: check?.success ? check.data : undefined,
      teaching: teaching.success ? teaching.data : undefined,
      cues: undefined,
    };
    // Repères écrits par le modèle, complétés par ceux qu'on déduit des mots de la phrase.
    const cues = inferCues(step.say, actions as Parameters<typeof inferCues>[1], cued?.cues);
    if (Object.keys(cues).length > 0) step.cues = cues;
    return { kind: "step", ...step };
  }

  function parseLine(line: string): ModelEvent | null {
    const found = extractJsonObject(line);
    const json = found === null ? null : escapeLatex(found);
    if (json === null) return line.startsWith("```") ? null : reject(line, "Pas d'objet JSON");

    let obj: unknown;
    try {
      obj = JSON.parse(json);
    } catch {
      // {"kind":"check":{…}} : la question écrite seule, en JSON cassé (vu le 21 octobre).
      const lone = /^\{\s*"kind"\s*:\s*"check"\s*:\s*(\{[\s\S]*\})\s*\}$/.exec(json);
      try {
        if (!lone) throw new Error();
        obj = { check: JSON.parse(lone[1]!) };
      } catch {
        return reject(line, "JSON invalide");
      }
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return reject(line, "Objet attendu");
    let record = obj as Record<string, unknown>;

    // Un modèle oublie parfois « kind » sur une étape, ou écrit « type » à la place
    // ({"type":"diagnosis",…}, vu le 21 octobre).
    const EVENT_KINDS = ["lesson", "step", "end", "diagnosis"];
    if (typeof record.kind !== "string" && typeof record.type === "string" && EVENT_KINDS.includes(record.type)) {
      const { type, ...rest } = record;
      record = { ...rest, kind: type };
    }
    // La question écrite seule sur sa ligne ({"kind":"check",prompt…} ou {"check":{…}}) : une
    // étape qui la pose à voix haute, plutôt qu'une leçon qui finit sans question.
    if (!("say" in record) && (record.kind === "check" || (record.kind === undefined && typeof record.check === "object"))) {
      const { kind: _kind, check, ...fields } = record;
      const question = (check ?? fields) as Record<string, unknown>;
      return parseStep({ say: question.prompt, do: [], check: question }, line);
    }
    const kind = typeof record.kind === "string" ? record.kind : "say" in record ? "step" : undefined;

    switch (kind) {
      case "lesson": {
        const parsed = LessonHeaderEvent.safeParse(record);
        return parsed.success ? parsed.data : reject(line, "En-tête invalide");
      }
      case "step":
        return parseStep(record, line);
      case "end": {
        const parsed = EndEvent.safeParse(record);
        if (parsed.success) return parsed.data;
        // Un « noticed » mal formé ne doit pas faire perdre le résumé.
        const { noticed: _noticed, ...rest } = record;
        const retry = EndEvent.safeParse(rest);
        return retry.success ? retry.data : { kind: "end", summary: [] };
      }
      case "diagnosis": {
        const parsed = DiagnosisEvent.safeParse(record);
        return parsed.success ? parsed.data : reject(line, "Fiche de diagnostic invalide");
      }
      default:
        return reject(line, "Type d'événement inconnu");
    }
  }

  return {
    parseLine,
    get issues() {
      return issues;
    },
  };
}

/**
 * Commandes LaTeX qu'un modèle écrit souvent sans doubler la barre oblique dans le JSON :
 * « \frac » deviendrait un saut de page suivi de « rac », « \times » une tabulation,
 * « \sqrt » ferait rejeter toute la ligne. On les double avant de lire le JSON.
 */
const LATEX_COMMANDS =
  "frac|dfrac|tfrac|sqrt|times|cdot|div|pm|text|mathrm|textbf|operatorname|left|right|leq|le|geq|ge|neq|ne|approx|" +
  "infty|circ|degree|pi|theta|alpha|beta|gamma|delta|Delta|lambda|mu|sigma|omega|varphi|phi|sin|cos|tan|log|ln|exp|" +
  "to|rightarrow|Rightarrow|angle|parallel|perp|triangle|sim|cong|overline|vec|hat|quad|in|cdots|ldots|dots";
const UNDOUBLED_LATEX = new RegExp(`(?<!\\\\)\\\\(${LATEX_COMMANDS})(?![a-zA-Z])`, "g");

export function escapeLatex(json: string): string {
  return json.includes("$") ? json.replace(UNDOUBLED_LATEX, "\\$&") : json;
}

/**
 * Repère les objets JSON de premier niveau dans un flux de texte, qu'ils
 * soient sur une ligne ou étalés sur plusieurs. Le texte hors des objets
 * (clôtures de code, phrases d'introduction) est ignoré.
 *
 * Un objet resté ouvert (accolade oubliée, chaîne non fermée) n'avale plus la
 * suite du tour : quand un nouvel événement commence en début de ligne
 * ({"kind":"step"…), ou à la fin du flux (`flush`), l'objet ouvert est refermé
 * par `closeJson` et rendu comme les autres.
 */
export class JsonObjectScanner {
  private current = "";
  private depth = 0;
  private inString = false;
  private escaped = false;

  push(chunk: string): string[] {
    const complete: string[] = [];
    for (const ch of chunk) {
      if (this.depth === 0) {
        if (ch === "{") this.open("{");
        continue;
      }
      this.current += ch;
      if (ch === '"' && NEW_EVENT.test(this.current.slice(-48))) {
        // Un nouvel événement commence alors que le précédent n'est pas refermé.
        const cut = this.current.lastIndexOf("\n");
        complete.push(closeJson(this.current.slice(0, cut)));
        this.open(this.current.slice(cut + 1).trimStart());
        continue;
      }
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === "\\") this.escaped = true;
        else if (ch === '"') this.inString = false;
        continue;
      }
      if (ch === '"') this.inString = true;
      else if (ch === "{") this.depth++;
      else if (ch === "}") {
        this.depth--;
        if (this.depth === 0) {
          complete.push(this.current);
          this.current = "";
        }
      }
      // Garde-fou : un objet démesuré est abandonné.
      if (this.current.length > 20_000) this.open("", 0);
    }
    return complete;
  }

  /** Fin du flux : l'objet encore ouvert (réponse coupée), refermé. */
  flush(): string[] {
    const rest = this.depth > 0 ? [closeJson(this.current)] : [];
    this.open("", 0);
    return rest;
  }

  /** Repart sur un objet qui commence par `text` (hors chaîne, une accolade ouverte). */
  private open(text: string, depth = 1): void {
    this.current = text;
    this.depth = depth;
    this.inString = false;
    this.escaped = false;
  }
}

/** Début d'un événement en début de ligne : {"kind":"step", "end", "lesson", "diagnosis" ou "check". */
const NEW_EVENT = /\n[ \t]*\{\s*"kind"\s*:\s*"(?:step|end|lesson|diagnosis|check)"$/;

/**
 * Referme un objet JSON coupé : la chaîne ouverte, puis les crochets et accolades
 * dans l'ordre inverse. Une virgule ou une clé laissée en suspens est retirée.
 */
export function closeJson(text: string): string {
  const open: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") open.push(ch);
    else if (ch === "}" || ch === "]") open.pop();
  }
  let out = text.trimEnd() + (inString ? '"' : "");
  out = out.replace(/,\s*$/, "").replace(/,\s*"[^"]*"\s*:\s*$/, "");
  return out + open.reverse().map((c) => (c === "{" ? "}" : "]")).join("");
}

/** Retire les clôtures de code et le texte autour du premier objet JSON de la ligne. */
export function extractJsonObject(line: string): string | null {
  const trimmed = line.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}
