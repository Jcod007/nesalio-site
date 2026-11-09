import { notFound } from "next/navigation";
import { VideoFrame } from "./VideoFrame";

export default function VideoPitch() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <>
    <style>{`
      html,body{overflow:hidden}
      .video-frame{position:absolute;left:0;top:0;width:1280px;height:720px;transform:scale(1.5);transform-origin:top left;overflow:hidden}
      .formula{position:absolute;left:244px;top:13px;z-index:8;font-family:var(--display);font-size:22px;font-weight:700;white-space:nowrap}
      .formula .violet{color:#5A45D6;background:#eeeaff;border-radius:6px;padding:3px 4px}
      .joyce-profile{display:flex;align-items:center;gap:8px;font-weight:700;margin-right:8px}
      .joyce-avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#eeeaff;color:#4532b8}
      .video-frame [class*="__dock"]{left:auto;right:24px;top:260px;bottom:auto;transform:none;width:410px}
      .video-frame [class*="__asked"]{max-width:100%;white-space:normal;text-overflow:clip}
      .video-frame [class*="__caption"]{font-size:1.24rem;overflow-wrap:normal;word-break:normal}
      .video-frame [class*="__recenter"]{display:none}
      .explanation{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3}
      .pause-label{position:absolute;right:38px;top:190px;background:#eeeaff;color:#4532b8;border-radius:12px;padding:8px 16px;font-weight:700;z-index:7}
      .export-controls{position:fixed;bottom:12px;left:20px;display:flex;gap:20px;background:white;padding:8px;z-index:50}
      nextjs-portal{display:none}
    `}</style>
    <VideoFrame/>
  </>;
}
