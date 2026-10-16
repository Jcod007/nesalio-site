/**
 * Transforme le texte brut du modèle en événements validés.
 *
 * Les modèles se trompent parfois de forme : bloc ```json autour de la
 * réponse, identifiant oublié, « line » au lieu de « segment »… On corrige ce
 * qui est sans ambiguïté, on valide tout le reste, et on écarte ce qui ne
 * passe pas. Une commande invalide est retirée sans perdre la phrase de
 * l'étape : l'élève entend l'explication même si un tracé manque.
 */
import {
  Action,
  Check,
  EndEvent,
  LessonHeaderEvent,
  Mood,
  type ModelEvent,
  type Step,
} from "@/domain/scene/schema";
import { z } from "zod";

/** Noms de commandes que les modèles inventent, et leur équivalent. */
const ACTION_ALIASES: Record<string, string> = {
  line: "segment",
  arrow: "vector",
  label: "text",
  equation: "note",
  annotation: "text",
  graph: "curve",
  plot: "curve",
  function: "curve",
  dot: "point",
  camera: "focus",
  zoom: "focus",
};

const DRAWABLE = new Set(["curve", "point", "vector", "segment", "text"]);

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
      action.type = ACTION_ALIASES[type] ?? type;
    }
    if (typeof action.type === "string" && DRAWABLE.has(action.type) && typeof action.id !== "string") {
      action.id = nextId(action.type);
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
    const say = z.string().trim().min(1).max(320).safeParse(obj.say);
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
    if (check && !check.success) issues.push({ line: JSON.stringify(obj.check).slice(0, 200), reason: "Question de vérification invalide" });

    const step: Step = {
      say: say.data,
      mood: mood.success ? mood.data : undefined,
      do: actions,
      check: check?.success ? check.data : undefined,
    };
    return { kind: "step", ...step };
  }

  function parseLine(line: string): ModelEvent | null {
    const json = extractJsonObject(line);
    if (json === null) return line.startsWith("```") ? null : reject(line, "Pas d'objet JSON");

    let obj: unknown;
    try {
      obj = JSON.parse(json);
    } catch {
      return reject(line, "JSON invalide");
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return reject(line, "Objet attendu");
    const record = obj as Record<string, unknown>;

    // Un modèle oublie parfois « kind » sur une étape.
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
        return parsed.success ? parsed.data : { kind: "end", summary: [] };
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
 * Repère les objets JSON de premier niveau dans un flux de texte, qu'ils
 * soient sur une ligne ou étalés sur plusieurs. Le texte hors des objets
 * (clôtures de code, phrases d'introduction) est ignoré.
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
        if (ch === "{") {
          this.depth = 1;
          this.current = "{";
        }
        continue;
      }
      this.current += ch;
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
      if (this.current.length > 20_000) {
        this.current = "";
        this.depth = 0;
        this.inString = false;
      }
    }
    return complete;
  }
}

/** Retire les clôtures de code et le texte autour du premier objet JSON de la ligne. */
export function extractJsonObject(line: string): string | null {
  const trimmed = line.trim().replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}
