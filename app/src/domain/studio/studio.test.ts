import { describe, expect, it } from "vitest";
import { STUDIO_DEMOS, roseVideo, musicVideo } from "@/content/studioDemos";
import { Action } from "@/domain/scene/schema";
import { estimateTempo } from "./beats";
import { checkVideo } from "./check";
import { composeScore, hashText, STYLE_BPM } from "./score";
import { createStudioParser, parseStudioText, type StudioScript } from "./script";
import { boardBeforeShot, boardsAfterShots } from "./stage";
import { barDuration, buildTimeline, foldBpm, planShot, shotAt } from "./timeline";

describe("script du studio", () => {
  it("lit l'en-tête, les plans et la fin, avec les champs propres au studio", () => {
    const text = [
      '{"kind":"lesson","title":"Une fleur","hook":"Ça dessine quoi ?","music":"epic"}',
      '{"kind":"step","say":"r = sin(4θ)","bars":2,"do":[{"type":"text","id":"eq","text":"$r$","at":[0,4]}]}',
      '{"kind":"step","say":"On tourne","reveal":true,"bars":9,"do":[{"type":"parametric","id":"r","x":"sin(4*t)*cos(t)","y":"sin(4*t)*sin(t)","t":[0,6.28]}]}',
      '{"kind":"end","cta":"Abonne-toi"}',
    ].join("\n");
    const { script } = parseStudioText(text);
    expect(script).not.toBeNull();
    expect(script!.title).toBe("Une fleur");
    expect(script!.hook).toBe("Ça dessine quoi ?");
    expect(script!.music).toBe("epic");
    expect(script!.cta).toBe("Abonne-toi");
    expect(script!.shots).toHaveLength(2);
    expect(script!.shots[0]!.bars).toBe(2);
    expect(script!.shots[1]!.reveal).toBe(true);
    expect(script!.shots[1]!.bars).toBe(8); // plafonné
  });

  it("garde le plan mais signale la commande refusée sur ce plan", () => {
    const parser = createStudioParser();
    parser.push('{"kind":"step","say":"Un point","do":[{"type":"point","id":"A","at":[0,0]},{"type":"fusée","id":"x"}]}');
    const script = parser.result("Test")!;
    expect(script.shots[0]!.do).toHaveLength(1);
    expect(script.shots[0]!.issues?.length).toBe(1);
  });

  it("accepte « shot » et « text » écrits par une autre IA, et du texte autour", () => {
    const { script } = parseStudioText('Voici le script :\n```json\n{"kind":"shot","text":"Bonjour","do":[]}\n```');
    expect(script?.shots[0]?.text).toBe("Bonjour");
  });

  it("sans plan, pas de script", () => {
    expect(parseStudioText('{"kind":"lesson","title":"x"}').script).toBeNull();
  });
});

describe("vidéos d'exemple", () => {
  it("toutes les commandes sont valides", () => {
    for (const demo of STUDIO_DEMOS) {
      for (const shot of demo.shots) for (const action of shot.do) expect(Action.safeParse(action).success, JSON.stringify(action)).toBe(true);
    }
  });

  it("passent la vérification sans erreur", () => {
    for (const demo of STUDIO_DEMOS) {
      const findings = checkVideo(demo, buildTimeline(demo, { bpm: STYLE_BPM[demo.music] }));
      expect(findings.filter((f) => f.severity === "error"), demo.title).toEqual([]);
    }
  });
});

describe("chronologie", () => {
  const timeline = buildTimeline(roseVideo, { bpm: 90 });

  it("chaque plan commence sur un premier temps et dure un nombre entier de mesures", () => {
    const bar = barDuration(90);
    for (const shot of timeline.shots) {
      expect(shot.startMs / bar).toBeCloseTo(Math.round(shot.startMs / bar), 6);
      expect(shot.durationMs).toBeCloseTo(shot.bars * bar, 6);
    }
    expect(timeline.totalMs).toBeCloseTo(timeline.totalBars * bar, 6);
  });

  it("le dessin finit avant la coupe", () => {
    for (const shot of timeline.shots) {
      for (const p of shot.actions) expect(p.offset + p.duration).toBeLessThanOrEqual(shot.durationMs);
    }
  });

  it("la révélation est ralentie pour occuper le plan", () => {
    const reveal = timeline.shots.find((s) => s.reveal)!;
    const curve = reveal.actions.find((p) => p.action.type === "parametric")!;
    expect(curve.duration).toBeGreaterThan(reveal.durationMs * 0.5);
  });

  it("un plan trop court pour son texte est allongé", () => {
    const script: StudioScript = { ...roseVideo, shots: [{ text: "un deux trois quatre cinq six sept huit neuf dix onze douze", do: [], bars: 1 }] };
    const t = buildTimeline(script, { bpm: 160 });
    expect(t.shots[0]!.bars).toBeGreaterThan(1);
  });

  it("les plans en trop sont retirés au-delà de 60 secondes", () => {
    const long: StudioScript = { ...roseVideo, shots: Array.from({ length: 10 }, (_, i) => ({ text: `plan ${i}`, do: [], bars: 8 })) };
    const t = buildTimeline(long, { bpm: 80 });
    expect(t.totalMs).toBeLessThanOrEqual(60_000);
    expect(t.shots.length).toBeLessThan(10);
  });

  it("replie un tempo par octave et trouve le plan à l'écran", () => {
    expect(foldBpm(180)).toBe(90);
    expect(foldBpm(60)).toBe(120);
    expect(shotAt(timeline, 0)?.index).toBe(0);
    expect(shotAt(timeline, timeline.outro.startMs + 1)).toBeNull();
  });

  it("des accents sur chaque plan et sur la fin", () => {
    expect(timeline.accents.filter((a) => a.kind === "reveal")).toHaveLength(1);
    expect(timeline.accents.at(-1)?.kind).toBe("end");
  });

  it("planShot ne déborde pas : les départs reculent, la vedette s'allonge sans dépasser la coupe", () => {
    const plan = planShot([{ type: "parametric", id: "p", x: "cos(t)", y: "sin(t)", t: [0, 6.28] } as Action, { type: "highlight", target: "p" } as Action], 2400, true);
    for (const p of plan) expect(p.offset + p.duration).toBeLessThanOrEqual(2400);
    expect(plan[0]!.duration).toBeGreaterThanOrEqual(1800);
  });
});

describe("tableau de la vidéo", () => {
  it("rejoue les plans et reprend l'aperçu au milieu", () => {
    const timeline = buildTimeline(musicVideo, { bpm: 120 });
    const boards = boardsAfterShots(timeline);
    expect(boards).toHaveLength(timeline.shots.length);
    expect(Object.keys(boards[1]!.nodes)).toContain("son");
    const before = boardBeforeShot(timeline, 3, 10_000);
    expect(before.nodes.son).toBeDefined();
    // Le repère et l'onde du premier plan ont été effacés par le deuxième.
    expect(before.axes).toBeNull();
  });
});

describe("vérification", () => {
  it("signale une cible absente, un texte long et l'absence de révélation", () => {
    const script: StudioScript = {
      title: "t",
      hook: "h",
      music: "lofi",
      cta: "c",
      shots: [
        { text: "un deux trois quatre cinq six sept huit neuf dix onze douze treize", do: [{ type: "highlight", target: "fantome" } as Action] },
      ],
    };
    const findings = checkVideo(script, buildTimeline(script, { bpm: 100 }));
    expect(findings.some((f) => f.severity === "error" && f.message.includes("fantome"))).toBe(true);
    expect(findings.some((f) => f.message.startsWith("Texte long"))).toBe(true);
    expect(findings.some((f) => f.message.includes("révélation"))).toBe(true);
  });

  it("signale une figure trop large pour le format vertical", () => {
    const script: StudioScript = {
      ...roseVideo,
      shots: [{ text: "large", do: [{ type: "segment", id: "s", from: [-20, 0], to: [20, 0] } as Action], reveal: true }],
    };
    const findings = checkVideo(script, buildTimeline(script, { bpm: 100 }));
    expect(findings.some((f) => f.message.startsWith("Figure très large"))).toBe(true);
  });
});

describe("musique", () => {
  const timeline = buildTimeline(roseVideo, { bpm: 90 });

  it("est déterministe et couvre toute la vidéo", () => {
    const a = composeScore(timeline, { style: "lofi", seed: hashText(roseVideo.title) });
    const b = composeScore(timeline, { style: "lofi", seed: hashText(roseVideo.title) });
    expect(a).toEqual(b);
    expect(a.durationSec).toBeCloseTo(timeline.totalMs / 1000, 2);
    expect(Math.max(...a.notes.map((n) => n.t))).toBeLessThan(a.durationSec);
  });

  it("frappe sur la révélation et prépare la montée juste avant", () => {
    for (const style of ["lofi", "electro", "epic"] as const) {
      const score = composeScore(timeline, { style });
      const reveal = timeline.accents.find((a) => a.kind === "reveal")!;
      const t = reveal.ms / 1000;
      expect(score.notes.some((n) => n.voice === "crash" && Math.abs(n.t - t) < 0.01 && n.vel > 0.5)).toBe(true);
      expect(score.notes.some((n) => n.voice === "riser" && Math.abs(n.t + n.dur - t) < 0.02)).toBe(true);
    }
  });
});

describe("tempo d'un morceau importé", () => {
  function clicks(bpm: number, offsetSec: number, seconds: number, sampleRate = 22050): Float32Array {
    const out = new Float32Array(seconds * sampleRate);
    let seed = 1;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.02;
    for (let i = 0; i < out.length; i++) out[i] = noise();
    const beat = 60 / bpm;
    for (let k = 0; offsetSec + k * beat < seconds; k++) {
      const start = Math.floor((offsetSec + k * beat) * sampleRate);
      const loud = k % 4 === 0 ? 1 : 0.5; // premier temps plus appuyé
      for (let i = 0; i < 400 && start + i < out.length; i++) out[start + i] = out[start + i]! + loud * Math.exp(-i / 60) * (i % 2 ? 1 : -1);
    }
    return out;
  }

  it.each([
    [96, 0.37],
    [124, 0.1],
    [84, 1.2],
  ])("trouve %d BPM et le premier temps fort", (bpm, offset) => {
    const estimate = estimateTempo(clicks(bpm, offset, 20), 22050);
    expect(Math.abs(estimate.bpm - bpm)).toBeLessThan(1.5);
    expect(Math.abs(estimate.offsetMs - offset * 1000)).toBeLessThan(40);
    expect(estimate.confidence).toBeGreaterThan(0.2);
  });

  it("un silence ne plante pas", () => {
    expect(estimateTempo(new Float32Array(22050 * 5), 22050).confidence).toBe(0);
  });
});
