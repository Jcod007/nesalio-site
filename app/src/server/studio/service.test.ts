import { describe, expect, it } from "vitest";
import { roseVideo } from "@/content/studioDemos";
import type { ChatProvider } from "@/server/config";
import type { CompletionOptions } from "@/server/tutor/chatCompletions";
import { buildRevisionMessages, serializeVideo, studioSystemPrompt } from "./prompt";
import { generateVideo, pickDemo, reviseShot } from "./service";

const provider: ChatProvider = { name: "gateway", protocol: "openai", endpoint: "https://x", apiKey: "k", model: "m" };

/** Une réponse de modèle découpée en morceaux, comme un vrai flux. */
function fakeCompletion(text: string, seen: CompletionOptions[] = []) {
  return async function* (options: CompletionOptions) {
    seen.push(options);
    for (let i = 0; i < text.length; i += 37) yield text.slice(i, i + 37);
  };
}

describe("service du studio", () => {
  it("sans modèle, joue l'exemple le plus proche de l'idée", async () => {
    const result = await generateVideo("un coeur avec des sinus", "devine", { provider: null, completion: fakeCompletion("") });
    expect(result.ok && result.source).toBe("demo");
    expect(result.ok && result.script.title).toBe("Un cœur avec des sinus");
    expect(pickDemo("lancer de basket").title).toContain("lancer");
  });

  it("transforme la réponse du modèle en script validé", async () => {
    const seen: CompletionOptions[] = [];
    const result = await generateVideo("une fleur", "devine", { provider, completion: fakeCompletion(serializeVideo(roseVideo), seen) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("model");
    expect(result.script.shots).toHaveLength(roseVideo.shots.length);
    expect(result.script.hook).toBe(roseVideo.hook);
    expect(seen[0]!.messages[0]!.content).toContain("DEVINE CE QUE ÇA DESSINE");
  });

  it("réessaie une fois une réponse vide, puis renvoie une erreur", async () => {
    const seen: CompletionOptions[] = [];
    const result = await generateVideo("rien", "libre", { provider, completion: fakeCompletion("Désolé.", seen) });
    expect(result.ok).toBe(false);
    expect(seen).toHaveLength(2);
  });

  it("refait un seul plan, avec le script et le tableau en contexte", async () => {
    const seen: CompletionOptions[] = [];
    const line = '{"kind":"step","say":"Plus petite !","bars":3,"reveal":true,"do":[{"type":"parametric","id":"rose","x":"2*sin(4*t)*cos(t)","y":"2*sin(4*t)*sin(t)","t":[0,6.2832]}]}';
    const result = await reviseShot(
      { script: roseVideo, shot: 1, instruction: "La fleur déborde, rapetisse-la", board: ["eq · text · r = 3 sin(4θ)"] },
      "devine",
      { provider, completion: fakeCompletion(line, seen) },
    );
    expect(result.ok && result.shots).toHaveLength(1);
    expect(result.ok && result.shots[0]!.text).toBe("Plus petite !");
    const user = seen[0]!.messages[1]!.content;
    expect(user).toContain("plan n° 2");
    expect(user).toContain("rapetisse-la");
    expect(user).toContain("eq · text");
  });

  it("les consignes pour une autre IA contiennent le format, les commandes et l'exemple", () => {
    const text = studioSystemPrompt("libre");
    expect(text).toContain('"kind":"lesson"');
    expect(text).toContain('{"type":"parametric"');
    expect(text).toContain(roseVideo.hook);
  });

  it("la révision signale les identifiants dont dépendent les plans suivants", () => {
    const messages = buildRevisionMessages({ script: roseVideo, shot: 1, instruction: "plus lent", board: [] }, "devine");
    expect(messages[1]!.content).toContain("utilisent ces identifiants : rose");
  });
});
