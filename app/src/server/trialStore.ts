import { BlobPreconditionFailedError, del, get, list, put } from "@vercel/blob";

export interface TrialEntry { etag: string; value: unknown }
export interface TrialStore {
  read(path: string): Promise<TrialEntry | null>;
  create(path: string, value: unknown): Promise<boolean>;
  replace(path: string, value: unknown, etag: string): Promise<boolean>;
  removeOlder(prefix: string, before: Date): Promise<number>;
}

/** Private, durable and fail-closed. Never use the best-effort transcript store for access decisions. */
export const privateTrialStore: TrialStore = {
  async read(path) {
    const result = await get(path, { access: "private", useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream) throw new Error("Trial quota read unavailable");
    return { etag: result.blob.etag, value: JSON.parse(await new Response(result.stream).text()) as unknown };
  },
  async create(path, value) {
    try {
      await put(path, JSON.stringify(value), {
        access: "private", addRandomSuffix: false, allowOverwrite: false,
        contentType: "application/json", cacheControlMaxAge: 60,
      });
      return true;
    } catch (error) {
      // The SDK does not expose a dedicated AlreadyExists class. Confirm the
      // existing record with a strong read; all other failures remain failures.
      const existing = await this.read(path);
      if (existing) return false;
      throw error;
    }
  },
  async replace(path, value, etag) {
    try {
      await put(path, JSON.stringify(value), {
        access: "private", addRandomSuffix: false, allowOverwrite: true, ifMatch: etag,
        contentType: "application/json", cacheControlMaxAge: 60,
      });
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return false;
      throw error;
    }
  },
  async removeOlder(prefix, before) {
    let cursor: string | undefined;
    let removed = 0;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      const expired = page.blobs.filter((blob) => new Date(blob.uploadedAt) < before).map((blob) => blob.pathname);
      for (let i = 0; i < expired.length; i += 500) await del(expired.slice(i, i + 500));
      removed += expired.length;
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return removed;
  },
};
