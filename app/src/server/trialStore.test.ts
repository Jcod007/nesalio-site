import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), list: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => ({
  ...mocks,
  BlobPreconditionFailedError: class BlobPreconditionFailedError extends Error {},
}));
import { BlobPreconditionFailedError } from "@vercel/blob";
import { privateTrialStore } from "./trialStore";

beforeEach(() => vi.resetAllMocks());

describe("private quota Blob adapter", () => {
  it("bypasses the CDN cache for every authoritative read and preserves the version", async () => {
    mocks.get.mockResolvedValue({ statusCode: 200, stream: new Response('{"count":2}').body, blob: { etag: "v2" } });
    expect(await privateTrialStore.read("trial.json")).toEqual({ etag: "v2", value: { count: 2 } });
    expect(mocks.get).toHaveBeenCalledWith("trial.json", { access: "private", useCache: false });
  });

  it("creates a deterministic private path without overwrite", async () => {
    mocks.put.mockResolvedValue({});
    expect(await privateTrialStore.create("trial.json", { count: 0 })).toBe(true);
    expect(mocks.put).toHaveBeenCalledWith(
      "trial.json",
      '{"count":0}',
      expect.objectContaining({ access: "private", addRandomSuffix: false, allowOverwrite: false }),
    );
  });

  it("treats a failed create as a collision only after confirming an existing record", async () => {
    mocks.put.mockRejectedValue(new Error("already exists or service failure"));
    mocks.get.mockResolvedValue({ statusCode: 200, stream: new Response('{"count":2}').body, blob: { etag: "v2" } });
    expect(await privateTrialStore.create("trial.json", { count: 0 })).toBe(false);
    mocks.get.mockResolvedValue(null);
    await expect(privateTrialStore.create("trial.json", { count: 0 })).rejects.toThrow("already exists or service failure");
  });

  it("uses ETag compare-and-swap and retries only genuine conflicts", async () => {
    mocks.put.mockRejectedValueOnce(new BlobPreconditionFailedError());
    expect(await privateTrialStore.replace("trial.json", { count: 3 }, "v2")).toBe(false);
    expect(mocks.put).toHaveBeenCalledWith("trial.json", '{"count":3}', expect.objectContaining({ access: "private", allowOverwrite: true, ifMatch: "v2" }));
    mocks.put.mockRejectedValueOnce(new Error("service down"));
    await expect(privateTrialStore.replace("trial.json", { count: 3 }, "v2")).rejects.toThrow("service down");
  });

  it("never treats unreadable content or unexpected HTTP states as an empty quota", async () => {
    mocks.get.mockResolvedValue({ statusCode: 304, stream: null });
    await expect(privateTrialStore.read("trial.json")).rejects.toThrow();
    mocks.get.mockResolvedValue({ statusCode: 200, stream: new Response("broken JSON").body, blob: { etag: "v2" } });
    await expect(privateTrialStore.read("trial.json")).rejects.toThrow();
  });

  it("deletes only expired files in its specified prefix while handling pagination", async () => {
    mocks.list
      .mockResolvedValueOnce({
        blobs: [
          { pathname: "trial/expired.json", uploadedAt: new Date("2026-01-01") },
          { pathname: "trial/new.json", uploadedAt: new Date("2026-11-04") },
        ],
        hasMore: true,
        cursor: "page2",
      })
      .mockResolvedValueOnce({ blobs: [], hasMore: false });
    expect(await privateTrialStore.removeOlder("trial/", new Date("2026-10-01"))).toBe(1);
    expect(mocks.list).toHaveBeenNthCalledWith(1, { prefix: "trial/", cursor: undefined, limit: 1000 });
    expect(mocks.list).toHaveBeenNthCalledWith(2, { prefix: "trial/", cursor: "page2", limit: 1000 });
    expect(mocks.del).toHaveBeenCalledExactlyOnceWith(["trial/expired.json"]);
  });
});
