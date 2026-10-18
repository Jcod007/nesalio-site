import { describe, expect, it } from "vitest";
import { SESSION_HEADER } from "@/domain/session";
import { createSessionLimits } from "./rateLimit";

const headers = (ip: string, session?: string) =>
  new Headers({ "x-forwarded-for": ip, ...(session ? { [SESSION_HEADER]: session } : {}) });

describe("limites par session", () => {
  it("deux élèves sur le même Wi-Fi ont chacun leur limite", () => {
    const limits = createSessionLimits({ limit: 2, windowMs: 60_000 });
    const a = headers("10.0.0.1", "aaaaaaaa-1111");
    const b = headers("10.0.0.1", "bbbbbbbb-2222");
    expect(limits.check(a, 0).allowed).toBe(true);
    expect(limits.check(a, 1).allowed).toBe(true);
    expect(limits.check(a, 2).allowed).toBe(false);
    // A a épuisé sa limite : B, sur la même adresse, n'est pas touché.
    expect(limits.check(b, 3).allowed).toBe(true);
    expect(limits.check(b, 3).session).toBe("bbbbbbbb-2222");
  });

  it("plafonne une adresse qui changerait de session à chaque requête", () => {
    const limits = createSessionLimits({ limit: 1, windowMs: 60_000, ipFactor: 3 });
    const results = Array.from({ length: 5 }, (_, i) => limits.check(headers("10.0.0.9", `session-${i}-xyz`), i).allowed);
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("sans session (ou session mal formée), la limite se compte par adresse", () => {
    const limits = createSessionLimits({ limit: 1, windowMs: 60_000 });
    expect(limits.check(headers("10.0.0.5", "x"), 0).session).toBeNull();
    expect(limits.check(headers("10.0.0.5"), 1).allowed).toBe(false);
  });
});
