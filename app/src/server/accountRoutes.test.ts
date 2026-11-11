import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: null }) }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { POST as voice } from "@/app/api/voice/route";
import { POST as transcribe } from "@/app/api/transcribe/route";
import { POST as feedback } from "@/app/api/feedback/route";
import { POST as afterTrial } from "@/app/api/apres-essai/route";

describe("protected API operations", () => {
  it.each([
    ["voice", voice],
    ["transcribe", transcribe],
    ["feedback", feedback],
    ["apres-essai", afterTrial],
  ] as const)("%s rejects an anonymous request before reading its payload or contacting services", async (path, handle) => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_placeholder");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_placeholder");
    vi.stubEnv("NESALIO_LOCAL_DEMO", "0");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      const input = new Request(`http://localhost/api/${path}`, { method: "POST", body: "not even JSON" });
      const response = await handle(input);
      expect(response.status).toBe(401);
      expect(input.bodyUsed).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});
