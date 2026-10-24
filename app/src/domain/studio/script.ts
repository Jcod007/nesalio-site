/**
 * Le script d'une vidéo du studio : ce que le modèle écrit pour une vidéo TikTok.
 *
 * Même langage de scène que Nesa (les commandes de dessin sont validées par le
 * même registre), avec trois différences :
 * - pas de voix : chaque plan porte un court texte affiché à l'écran ;
 * - une accroche (« hook ») affichée en grand dans la première seconde ;
 * - le rythme se compte en mesures de musique (« bars ») : chaque plan commence
 *   sur un temps fort.
 *
 * Le modèle écrit des lignes JSON proches de celles du tuteur, qu'il connaît déjà :
 *   {"kind":"lesson","title":"…","hook":"…","music":"lofi|electro|epic"}
 *   {"kind":"step","say":"texte à l'écran","bars":2,"reveal":true,"do":[…]}
 *   {"kind":"end","cta":"…"}
 * Les étapes passent par le validateur du tuteur (corrections sans ambiguïté,
 * commandes invalides retirées) ; les champs propres au studio sont lus à part.
 */
import { z } from "zod";
import type { Action } from "@/domain/scene/schema";
import { createModelOutputParser, JsonObjectScanner, type ParseIssue } from "@/domain/tutor/modelOutput";

export const MusicStyle = z.enum(["lofi", "electro", "epic"]);
export type MusicStyle = z.infer<typeof MusicStyle>;

export const MUSIC_STYLES: readonly { id: MusicStyle; label: string }[] = [
  { id: "lofi", label: "Lo-fi" },
  { id: "electro", label: "Électro" },
  { id: "epic", label: "Épique" },
];

/** Formats proposés dans le studio : chacun oriente les consignes du modèle. */
export const VideoFormat = z.enum(["devine", "notion", "physique", "libre"]);
export type VideoFormat = z.infer<typeof VideoFormat>;

export const MAX_SHOTS = 10;
export const MAX_BARS = 8;
/** Texte à l'écran : court, lisible en un coup d'œil sur un téléphone. */
export const MAX_CAPTION = 90;
export const MAX_HOOK = 70;

export interface Shot {
  /** Texte affiché pendant le plan (sans voix). */
  text: string;
  do: Action[];
  /** Mesures demandées (le minimum utile est calculé par la chronologie). */
  bars?: number;
  /** Plan de révélation : la musique marque le coup (montée, impact). */
  reveal?: boolean;
  /** Commandes du plan refusées par le validateur (raison courte), montrées dans la vérification. */
  issues?: string[];
}

export interface StudioScript {
  title: string;
  hook: string;
  music: MusicStyle;
  shots: Shot[];
  cta: string;
}

export const DEFAULT_CTA = "Plus de maths qui se dessinent sur nesalio.com";

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
};

/** Valeur d'un champ texte dans une ligne JSON, même si le reste de la ligne est mal formé. */
function readString(line: string, key: string): string | undefined {
  const match = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(line);
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1];
  }
}

function readNumber(line: string, key: string): number | undefined {
  const match = new RegExp(`"${key}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`).exec(line);
  return match ? Number(match[1]) : undefined;
}

function readBool(line: string, key: string): boolean | undefined {
  const match = new RegExp(`"${key}"\\s*:\\s*(true|false)`).exec(line);
  return match ? match[1] === "true" : undefined;
}

/** Les champs propres au studio sont dans l'objet de premier niveau, pas dans "do". */
function headOf(objectText: string): string {
  const at = objectText.search(/"do"\s*:/);
  return at < 0 ? objectText : objectText.slice(0, at);
}

/** Raison lisible d'une commande refusée (le message brut du validateur est trop technique). */
function describeIssue(issue: ParseIssue): string {
  const type = readString(issue.line, "type");
  if (/discriminator/i.test(issue.reason)) return `commande « ${type ?? "?"} » inconnue`;
  return `${type ? `« ${type} » : ` : ""}${issue.reason}`.slice(0, 160);
}

export interface StudioParser {
  /** Analyse un objet JSON complet écrit par le modèle. */
  push(objectText: string): void;
  /** Le script, ou `null` s'il n'y a aucun plan utilisable. */
  result(fallbackTitle: string): StudioScript | null;
  readonly issues: readonly ParseIssue[];
  readonly shotCount: number;
}

export function createStudioParser(): StudioParser {
  const parser = createModelOutputParser();
  const extraIssues: ParseIssue[] = [];
  let title: string | undefined;
  let hook: string | undefined;
  let music: MusicStyle | undefined;
  let cta: string | undefined;
  const shots: Shot[] = [];

  return {
    get issues() {
      return [...parser.issues, ...extraIssues];
    },
    get shotCount() {
      return shots.length;
    },
    push(objectText) {
      const head = headOf(objectText);
      const kind = readString(head, "kind") ?? readString(head, "type");
      if (kind === "lesson" || kind === "video") {
        title = readString(head, "title") ?? title;
        hook = readString(head, "hook") ?? hook;
        const style = MusicStyle.safeParse(readString(head, "music"));
        if (style.success) music = style.data;
        return;
      }
      if (kind === "end") {
        cta = readString(head, "cta") ?? cta;
        return;
      }
      if (shots.length >= MAX_SHOTS) return;
      // « shot » ou « text » au lieu de « step » / « say » : même chose pour le validateur du tuteur.
      const normalized = objectText
        .replace(/"kind"\s*:\s*"shot"/, '"kind":"step"')
        .replace(/^(\{\s*(?:"kind"\s*:\s*"step"\s*,\s*)?)"text"\s*:/, '$1"say":');
      const before = parser.issues.length;
      const event = parser.parseLine(normalized);
      const refused = parser.issues.slice(before).map(describeIssue);
      if (!event || event.kind !== "step") {
        if (!event) return;
        extraIssues.push({ line: objectText.slice(0, 200), reason: `Ligne ignorée (${event.kind})` });
        return;
      }
      // Une question n'a pas de sens dans une vidéo : seule l'étape est gardée.
      const bars = readNumber(head, "bars");
      shots.push({
        text: clip(event.say, MAX_CAPTION),
        do: event.do,
        bars: bars === undefined ? undefined : Math.min(MAX_BARS, Math.max(1, Math.round(bars))),
        reveal: readBool(head, "reveal") || undefined,
        ...(refused.length > 0 ? { issues: refused } : {}),
      });
    },
    result(fallbackTitle) {
      if (shots.length === 0) return null;
      const safeTitle = clip(title ?? fallbackTitle, 80);
      return {
        title: safeTitle,
        hook: clip(hook ?? safeTitle, MAX_HOOK),
        music: music ?? "lofi",
        shots,
        cta: clip(cta ?? DEFAULT_CTA, MAX_CAPTION),
      };
    },
  };
}

/** Schéma d'un script reçu par le navigateur (réponse de /api/studio, ou script modifié dans le studio). */
export const StudioScriptSchema = z.object({
  title: z.string().trim().min(1).max(80),
  hook: z.string().trim().min(1).max(MAX_HOOK + 10),
  music: MusicStyle,
  cta: z.string().trim().min(1).max(MAX_CAPTION + 10),
  shots: z
    .array(
      z.object({
        text: z.string().trim().max(MAX_CAPTION + 10),
        do: z.array(z.unknown()),
        bars: z.number().int().min(1).max(MAX_BARS).optional(),
        reveal: z.boolean().optional(),
        issues: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(MAX_SHOTS),
});

/** Lit un script entier (réponse du modèle, ou texte collé depuis une autre IA). */
export function parseStudioText(text: string, fallbackTitle = "Vidéo Nesalio"): { script: StudioScript | null; issues: readonly ParseIssue[] } {
  const parser = createStudioParser();
  const scanner = new JsonObjectScanner();
  for (const object of [...scanner.push(text), ...scanner.flush()]) parser.push(object);
  return { script: parser.result(fallbackTitle), issues: parser.issues };
}
