// Aperçu local de la capture : réutilise l'application, sans modifier TutorApp.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { PitchFrame } from "./PitchFrame";

export default function PitchCapture() {
  if (process.env.NODE_ENV !== "development") notFound();
  const source = readFileSync(join(process.cwd(), "../analyses/pitch-2026-11-01/capture.html"), "utf8");
  const css = source.match(/<style>([\s\S]*?)<\/style>/)![1]!;
  const sidebar = source.match(/<aside[^>]*>([\s\S]*?)<\/aside>/)![1]!;
  return <>
    <style>{css + ".stage{position:relative;transform:translateZ(0);min-width:0;height:100%;overflow:hidden}.sidebar{font-family:Arial,sans-serif}nextjs-portal{display:none}"}</style>
    <div className="workspace">
      <aside className="sidebar" aria-label="Espace compte de démonstration" dangerouslySetInnerHTML={{__html:sidebar}} />
      <div className="stage"><PitchFrame /></div>
    </div>
  </>;
}
