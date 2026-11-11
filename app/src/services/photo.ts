import { PHOTO_MAX_BYTES, PHOTO_MAX_EDGE, PHOTO_MAX_TEXT, type PhotoReading } from "@/domain/photo";
import { sessionHeaders } from "@/services/session";

/** Redessiner la photo applique son orientation et retire ses métadonnées. */
async function preparePhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choisis une photo JPG, PNG ou WebP.");
  }
  if (file.size > 20_000_000) throw new Error("Cette photo est trop lourde. Recadre l'exercice ou choisis une autre photo.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Cette photo est illisible. Choisis une autre photo JPG, PNG ou WebP.");
  });
  try {
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Ton navigateur n'a pas réussi à préparer la photo.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (base64.length * 3 / 4 > PHOTO_MAX_BYTES) throw new Error("La photo est trop détaillée. Recadre uniquement l'exercice.");
    return base64;
  } finally {
    bitmap.close();
  }
}

export async function readPhoto(file: File, signal: AbortSignal): Promise<PhotoReading> {
  const image = await preparePhoto(file);
  signal.throwIfAborted();
  const response = await fetch("/api/photo", {
    method: "POST", signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ image }),
  });
  const data = await response.json().catch(() => {
    throw new Error("La lecture de la photo est indisponible pour le moment.");
  });
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "La lecture de la photo est indisponible.");
  if (typeof data.text !== "string" || !data.text.trim() || data.text.length > PHOTO_MAX_TEXT ||
      !Array.isArray(data.uncertainties) || !data.uncertainties.every((value: unknown) => typeof value === "string")) {
    throw new Error("La lecture de la photo est incomplète. Réessaie.");
  }
  return { text: data.text, uncertainties: data.uncertainties };
}
