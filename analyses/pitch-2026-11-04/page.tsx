import { notFound } from "next/navigation";
import { JoyceCapture } from "./JoyceCapture";

export default function JoycePitch() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <>
    <style>{`
      html,body { overflow:hidden; }
      .pitch-frame { position:absolute; top:0; left:0; width:1280px; height:720px; transform:scale(1.5); transform-origin:top left; overflow:hidden; }
      .joyce-profile { display:flex; align-items:center; gap:8px; font-weight:700; margin-right:8px; }
      .joyce-avatar { display:grid; place-items:center; width:32px; height:32px; background:#eeeaff; color:#4532b8; border-radius:50%; }
      .pitch-frame [class*="__recenter"] { display:none; }
      nextjs-portal { display:none; }
    `}</style>
    <div className="pitch-frame"><JoyceCapture /></div>
  </>;
}
