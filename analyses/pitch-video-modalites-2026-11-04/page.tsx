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
      .formula .maximum{color:#18774F;background:#E7F4ED;border-radius:6px;padding:3px 4px}
      .joyce-profile{display:flex;align-items:center;gap:8px;font-weight:700;margin-right:8px}
      .joyce-avatar{position:relative;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#eeeaff;color:#4532b8}
      .profile-signal{position:absolute;bottom:-4px;right:-5px;display:grid;place-items:center;width:19px;height:19px;border-radius:50%;background:#5A45D6;color:#fff;border:2px solid #F6F8FC}
      .profile-signal svg{width:11px;height:11px}
      .profile-keyboard{color:#4532B8;background:#fff;border-color:#DCD6F7}
      .video-frame [class*="__dock"]{left:auto;right:24px;top:260px;bottom:auto;transform:none;width:410px}
      .video-frame [class*="__asked"]{max-width:100%;white-space:normal;text-overflow:clip}
      .video-frame .student-message{min-width:260px;max-width:340px;transform:translateY(-84%);padding:8px 12px;border-radius:12px;text-align:left}
      .student-message[data-mode="voice"]{background:#F8F6FF}
      .student-content{margin:4px 0 0;font-size:1rem;line-height:1.35;min-height:22px}
      .message-byline{display:flex;align-items:center;gap:6px;font-size:.73rem;line-height:1.35;font-weight:400;color:#56617A;white-space:nowrap}
      .message-byline strong{font-size:.8rem;color:#18223A;font-weight:700}
      .teacher-byline{margin:0 0 5px}
      .message-byline svg{flex:none;color:#5A45D6}
      .voice-waves{display:inline-flex;align-items:center;gap:2px;height:15px;margin-left:1px;color:#5A45D6}
      .voice-waves i{display:block;width:2px;min-height:3px;border-radius:2px;background:currentColor}
      .typing-caret{color:#5A45D6;font-weight:400;margin-left:1px}
      .microphone-on{background:#EEE9FF!important;color:#4532B8!important;border-color:#5A45D6!important}
      .written-note{display:flex;gap:5px;align-items:flex-start;font-size:.82rem;line-height:1.4;color:#56617A;margin:9px 0 0}
      .written-note svg{flex:none;margin-top:2px}
      .video-frame [class*="__caption"]{font-size:1.24rem;overflow-wrap:normal;word-break:normal}
      .video-frame [class*="__recenter"]{display:none}
      .explanation{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3}
      .pause-label{position:absolute;right:38px;top:190px;background:#eeeaff;color:#4532b8;border-radius:12px;padding:8px 16px;font-weight:700;z-index:7}
      .video-frame[data-stage="diagnosis"] [class*="__asked"]{border-color:#AD5B14;background:#FFF9F1}
      .video-frame[data-stage="success"] [class*="__asked"]{border-color:#23936A;background:#F0FAF5}
      .confirmation{position:absolute;right:38px;top:164px;background:#E7F4ED;color:#18774F;border-radius:12px;padding:8px 16px;font-weight:700;z-index:7}
      .export-controls{position:fixed;bottom:12px;left:20px;display:flex;gap:20px;background:white;padding:8px;z-index:50}
      nextjs-portal{display:none}
    `}</style>
    <VideoFrame/>
  </>;
}
