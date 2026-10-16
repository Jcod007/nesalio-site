/**
 * Découpe un flux de texte en lignes complètes (JSON délimité par des sauts
 * de ligne). Utilisé des deux côtés : le serveur lit la réponse du modèle,
 * le navigateur lit la réponse du serveur.
 */
export class LineSplitter {
  private buffer = "";

  /** Ajoute un morceau de texte et renvoie les lignes désormais complètes. */
  push(chunk: string): string[] {
    this.buffer += chunk;
    const parts = this.buffer.split("\n");
    this.buffer = parts.pop() ?? "";
    return parts.map((line) => line.trim()).filter((line) => line.length > 0);
  }

  /** Renvoie la dernière ligne incomplète, à la fin du flux. */
  flush(): string[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest ? [rest] : [];
  }
}

/** Lit un `ReadableStream` d'octets et produit ses lignes au fur et à mesure. */
export async function* readLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const splitter = new LineSplitter();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* splitter.push(decoder.decode(value, { stream: true }));
    }
    yield* splitter.push(decoder.decode());
    yield* splitter.flush();
  } finally {
    reader.releaseLock();
  }
}

export function encodeLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
