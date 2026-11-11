import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { CaptureFrame } from "./CaptureFrame";

export default async function CaptureCorrection() {
  if (process.env.NODE_ENV !== "development") notFound();
  const scene = JSON.parse(await readFile(join(process.cwd(), "../analyses/pitch-2026-11-04/scene-capture.json"), "utf8"));
  return <>
    <style>{`
      html,body{overflow:hidden}
      .pitch-frame{position:absolute;left:0;top:0;width:1280px;height:720px;transform:scale(1.5);transform-origin:top left;overflow:hidden}
      .joyce-profile{display:flex;align-items:center;gap:8px;font-weight:700;margin-right:8px}
      .joyce-avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#eeeaff;color:#4532b8}
      .pitch-frame [class*="__dock"]{left:auto;right:24px;top:150px;bottom:auto;transform:none;width:410px}
      .pitch-frame [class*="__asked"]{max-width:100%;right:8px;white-space:normal;text-overflow:clip}
      .pitch-frame [class*="__caption"]{overflow-wrap:normal;word-break:normal}
      .pitch-frame [class*="__controls"]{gap:10px}
      .pitch-frame [class*="__recenter"]{display:none}
      nextjs-portal{display:none}
    `}</style>
    <div className="pitch-frame"><CaptureFrame {...scene}/></div>
  </>;
}
