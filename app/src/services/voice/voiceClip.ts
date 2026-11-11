import type { Beat } from "@/domain/nesalio/contract";
import { sessionHeaders } from "@/services/session";

export async function fetchVoiceClip(
  endpoint: string,
  text: string,
  signal: AbortSignal,
  cues?: Beat["cues"],
): Promise<{ response: Response; blob: Blob | null }> {
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ text, cues }),
  });
  return { response, blob: response.ok ? await response.blob() : null };
}

export function readClipDuration(audio: HTMLAudioElement, url: string, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    function cleanup() {
      audio.onloadedmetadata = audio.onerror = null;
      signal.removeEventListener("abort", abort);
    }
    function abort() {
      cleanup();
      reject(signal.reason);
    }
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      cleanup();
      if (Number.isFinite(audio.duration) && audio.duration > 0) resolve(audio.duration * 1000);
      else reject(new Error("Durée audio indisponible."));
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Clip audio illisible."));
    };
    audio.src = url;
  });
}
