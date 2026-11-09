/**
 * Source d'étapes côté navigateur : appelle /api/tutor et lit le flux NDJSON.
 * Chaque ligne est revalidée ici aussi (défense en profondeur).
 */
import { StreamEvent, type StepEventT } from "@/domain/scene/schema";
import { INSPECTION_HEADER } from "@/domain/tutor/inspection";
import { readLines } from "@/domain/tutor/ndjson";
import type { TutorSource } from "@/engine/ports";
import { sessionHeaders } from "@/services/session";

export interface StepInspection {
  raw: string | null;
  server: string;
}

export function createHttpSource(endpoint = "/api/tutor", inspection?: WeakMap<StepEventT, StepInspection>): TutorSource {
  return {
    async *open(request, signal) {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json", ...sessionHeaders(), ...(inspection ? { [INSPECTION_HEADER]: "1" } : {}) },
          body: JSON.stringify(request),
        });
      } catch {
        if (signal.aborted) return;
        yield { kind: "error", code: "upstream", message: "Impossible de joindre Nesa. Vérifie ta connexion." };
        return;
      }

      if (!response.body) {
        yield { kind: "error", code: "upstream", message: "Réponse vide du serveur." };
        return;
      }

      if (!response.headers.get("content-type")?.toLowerCase().includes("application/x-ndjson")) {
        yield { kind: "error", code: "upstream", message: "Réponse inattendue du serveur. Réessaie ?" };
        return;
      }
      let terminal = false;
      let modelStep: string | null = null;
      for await (const line of readLines(response.body)) {
        let json: unknown;
        try {
          json = JSON.parse(line);
        } catch {
          yield { kind: "error", code: "upstream", message: "Réponse illisible du serveur. Réessaie ?" };
          return;
        }
        if (inspection && json && typeof json === "object" && "kind" in json && json.kind === "trace-step"
          && "raw" in json && typeof json.raw === "string") {
          modelStep = json.raw;
          continue;
        }
        const parsed = StreamEvent.safeParse(json);
        if (!parsed.success) {
          yield { kind: "error", code: "upstream", message: "Réponse invalide du serveur. Réessaie ?" };
          return;
        }
        if (!response.ok && parsed.data.kind !== "error") {
          yield { kind: "error", code: "upstream", message: "Le serveur n'a pas pu répondre. Réessaie ?" };
          return;
        }
        if (parsed.data.kind === "end" || parsed.data.kind === "await" || parsed.data.kind === "error") terminal = true;
        if (inspection && parsed.data.kind === "step") {
          inspection.set(parsed.data, { raw: modelStep, server: JSON.stringify(json, null, 2) });
        }
        modelStep = null;
        yield parsed.data;
      }
      if (!terminal) yield { kind: "error", code: "upstream", message: "La connexion avec Nesa a été coupée. Réessaie ?" };
    },
  };
}
