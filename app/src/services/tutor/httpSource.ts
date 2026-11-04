/**
 * Source d'étapes côté navigateur : appelle /api/tutor et lit le flux NDJSON.
 * Chaque ligne est revalidée ici aussi (défense en profondeur).
 */
import { StreamEvent } from "@/domain/scene/schema";
import { readLines } from "@/domain/tutor/ndjson";
import type { TutorSource } from "@/engine/ports";
import { sessionHeaders } from "@/services/session";
import { updateTrialFromResponse, waitForAccount } from "@/services/trialEvents";

export function createHttpSource(endpoint = "/api/tutor"): TutorSource {
  return {
    async *open(request, signal) {
      const fetchTurn = () => fetch(endpoint, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify(request),
      });
      let response: Response;
      try {
        response = await fetchTurn();
        updateTrialFromResponse(response);
        if (response.status === 401 && response.headers.get("X-Nesalio-Account-Required") === "1") {
          await response.body?.cancel();
          if (!(await waitForAccount(signal))) return;
          response = await fetchTurn();
          updateTrialFromResponse(response);
        }
      } catch {
        if (signal.aborted) return;
        yield { kind: "error", code: "upstream", message: "Impossible de joindre Nesa. Vérifie ta connexion." };
        return;
      }

      if (!response.body) {
        yield { kind: "error", code: "upstream", message: "Réponse vide du serveur." };
        return;
      }

      for await (const line of readLines(response.body)) {
        let json: unknown;
        try {
          json = JSON.parse(line);
        } catch {
          continue;
        }
        const parsed = StreamEvent.safeParse(json);
        if (parsed.success) yield parsed.data;
      }
    },
  };
}
