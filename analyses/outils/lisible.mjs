// Rend une leçon Nesalio lisible : ce qui est dit et ce qui est montré, tranche par tranche.
import { readFileSync, writeFileSync } from "node:fs";
const [, , input, output] = process.argv;
const l = JSON.parse(readFileSync(input, "utf8"));
const out = [];
out.push(`TITRE : ${l.lesson?.title}`);
const ctx = l.scene?.math_context ?? {};
if (Object.keys(ctx.symbols ?? {}).length || Object.keys(ctx.expressions ?? {}).length) out.push(`math_context : ${JSON.stringify(ctx)}`);
const groups = new Map();
const declared = new Map();
const revealed = new Set();
const reveal = (id) => { revealed.add(id); for (const m of groups.get(id) ?? []) reveal(m); };
for (const s of l.slices) {
  for (const g of s.groups ?? []) groups.set(g.id, g.items);
  for (const o of s.introduces ?? []) declared.set(o.id, o);
  for (const b of s.beats ?? []) for (const d of b.do ?? []) {
    if (["show", "draw", "write"].includes(d.verb)) reveal(d.target);
    if (d.verb === "transform") reveal(d.target);
  }
}
for (const s of l.slices) {
  out.push(`=== Tranche ${s.slice_id}`);
  for (const o of s.introduces ?? []) {
    const body = o.content !== undefined ? JSON.stringify(o.content) : JSON.stringify(o.params ?? {});
    const extra = [o.parts ? `parts=${o.parts.map((p) => p.text).join(" | ")}` : "", o.attachment ? `attaché à ${o.attachment.parent}` : "", revealed.has(o.id) ? "" : "  <<JAMAIS MONTRÉ>>"].filter(Boolean).join(" ");
    out.push(`  OBJET ${o.id} [${o.type}] ${body} ${extra}`);
  }
  for (const g of s.groups ?? []) out.push(`  GROUPE ${g.id} = ${g.items.join(", ")}`);
  for (const b of s.beats ?? []) {
    out.push(`DIT (${b.id}) : ${b.say}`);
    for (const d of b.do ?? []) {
      const rest = { ...d }; for (const k of ["id", "verb", "target", "at"]) delete rest[k];
      out.push(`    ${d.verb} ${d.target ?? ""} @${d.at ?? "-"} ${Object.keys(rest).length ? JSON.stringify(rest) : ""}`);
    }
  }
}
const words = l.slices.flatMap((s) => (s.beats ?? []).map((b) => b.say)).join(" ").split(/\s+/).length;
out.push(`--- ${l.slices.length} tranches, ${words} mots dits (≈ ${(words / 150).toFixed(1)} min d'oral)`);
writeFileSync(output, out.join("\n"));
