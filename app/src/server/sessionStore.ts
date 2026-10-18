/**
 * Stockage des séances enregistrées : un magasin Vercel Blob PRIVÉ, à
 * Montréal (nesalio-seances). Rien n'y est lisible sans jeton.
 *
 * L'enregistrement ne doit jamais gêner l'élève : chaque écriture est faite
 * après la réponse, et une erreur est seulement notée dans les journaux.
 * Désactivé sans BLOB_READ_WRITE_TOKEN (développement local) ou avec
 * RECORD_SESSIONS=0.
 */
import { del, get, list, put } from "@vercel/blob";
import { isOlderThan, RETENTION_DAYS, turnPath, type RecordEnv, type TurnRecord } from "@/domain/sessionLog";

/** Ce dont on a besoin d'un magasin de fichiers (Vercel Blob, ou un faux en mémoire pour les tests). */
export interface BlobPort {
  put(pathname: string, body: string, options: { access: "private"; contentType: string }): Promise<void>;
  list(prefix: string): Promise<Array<{ pathname: string; uploadedAt: Date }>>;
  read(pathname: string): Promise<string | null>;
  del(pathnames: string[]): Promise<void>;
}

const vercelBlob: BlobPort = {
  async put(pathname, body, options) {
    await put(pathname, body, { ...options, addRandomSuffix: false, allowOverwrite: false });
  },
  async list(prefix) {
    const found: Array<{ pathname: string; uploadedAt: Date }> = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      for (const blob of page.blobs) found.push({ pathname: blob.pathname, uploadedAt: new Date(blob.uploadedAt) });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return found;
  },
  async read(pathname) {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return await new Response(result.stream).text();
  },
  async del(pathnames) {
    if (pathnames.length > 0) await del(pathnames);
  },
};

/** Le magasin à utiliser, ou null si l'enregistrement est désactivé. */
export function sessionBlob(env: NodeJS.ProcessEnv = process.env): BlobPort | null {
  if (env.RECORD_SESSIONS === "0" || !env.BLOB_READ_WRITE_TOKEN) return null;
  return vercelBlob;
}

export function recordEnv(env: NodeJS.ProcessEnv = process.env): RecordEnv {
  return env.VERCEL_ENV === "production" ? "production" : env.VERCEL_ENV === "preview" ? "preview" : "development";
}

/** Écrit un tour. Ne lève jamais : renvoie false si rien n'a été écrit. */
export async function saveTurn(record: TurnRecord, blob: BlobPort | null = sessionBlob()): Promise<boolean> {
  if (!blob) return false;
  try {
    await blob.put(turnPath(record), JSON.stringify(record), { access: "private", contentType: "application/json" });
    return true;
  } catch (error) {
    console.warn("séances : enregistrement impossible", (error as Error).message);
    return false;
  }
}

/** Tours enregistrés un jour donné (AAAA-MM-JJ), dans l'ordre ; `session` = forme courte (8 caractères). */
export async function listTurns(
  filter: { env: RecordEnv; day: string; session?: string },
  blob: BlobPort | null = sessionBlob(),
  max = 300,
): Promise<TurnRecord[]> {
  if (!blob) return [];
  const prefix = `${filter.env}/${filter.day}/${filter.session ? `${filter.session}/` : ""}`;
  const files = (await blob.list(prefix)).sort((a, b) => fileTime(a.pathname).localeCompare(fileTime(b.pathname))).slice(0, max);
  const turns: TurnRecord[] = [];
  for (const file of files) {
    const body = await blob.read(file.pathname);
    if (body) turns.push(JSON.parse(body) as TurnRecord);
  }
  return turns;
}

/** Heure du tour, tirée du nom de fichier (ordre chronologique dans la journée). */
function fileTime(pathname: string): string {
  return pathname.split("/").pop() ?? pathname;
}

/** Supprime les enregistrements plus vieux que la durée de conservation. Renvoie le nombre supprimé. */
export async function purgeOld(now: Date, blob: BlobPort | null = sessionBlob(), days = RETENTION_DAYS): Promise<number> {
  if (!blob) return 0;
  const old = (await blob.list("")).filter((file) => isOlderThan(file.uploadedAt, days, now)).map((file) => file.pathname);
  for (let i = 0; i < old.length; i += 500) await blob.del(old.slice(i, i + 500));
  return old.length;
}
