// Montage : la vidéo du navigateur + chaque phrase de Nesa posée à l'instant exact où elle a été jouée.
// Le son est complété de silence jusqu'à la fin de l'image (la fin de séance reste visible).
// Usage : node montage.mjs <dossier du tournage> <sortie.mp4> [début en s]
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [dir, out, startArg] = process.argv.slice(2);
const start = Number(startArg ?? 0);
const { pageCreated, clips, events } = JSON.parse(readFileSync(`${dir}/voix.json`, "utf8"));
const video = readdirSync(dir).find((f) => f.endsWith(".webm"));

// Une phrase peut être jouée plusieurs fois (répétée) : chaque « playing » est un placement.
const fileOf = new Map(clips.map((c) => [c.text, c.file]));
const placements = events
  .filter((e) => e.kind === "playing" && e.pos < 0.05 && fileOf.has(e.text))
  .map((e) => ({ file: fileOf.get(e.text), at: Math.max(0, e.at - pageCreated - start * 1000) }));

const args = ["-y", "-ss", String(start), "-i", `${dir}/${video}`];
for (const p of placements) args.push("-i", `${dir}/${p.file}`);
const delays = placements.map((p, i) => `[${i + 1}:a]adelay=${Math.round(p.at)}|${Math.round(p.at)},aresample=48000[a${i}]`);
const mix = `${placements.map((_, i) => `[a${i}]`).join("")}amix=inputs=${placements.length}:normalize=0:dropout_transition=0,volume=1.0,apad[aout]`;
args.push(
  "-filter_complex", [...delays, mix].join(";"),
  "-map", "0:v", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", out,
);
console.log(`${placements.length} phrases placées`);
execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });
console.log("écrit :", out);
