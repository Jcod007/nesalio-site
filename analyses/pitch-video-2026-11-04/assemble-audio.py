from pathlib import Path
import sys,subprocess,json,array,wave
sys.path.insert(0,r'C:/Users/compt2/.codex/visualizations/2026/10/29/01a187e1-c1a7-7762-a229-204f933cfadd/video-tools')
import imageio_ffmpeg
root=Path(r'C:/Users/compt2/Desktop/nesalio-site/analyses/pitch-video-2026-11-04')
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
meta=json.loads((root/'audio-timing.json').read_text())
mix=array.array('h',[0])*(48000*10)
for i,m in enumerate(meta):
 pitch=1.1 if i==1 else 1
 speed=m['duration']/pitch/m['target']
 filters=f'asetrate={int(24000*pitch)},aresample=48000,atempo={speed:.8f}'
 result=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-i',str(root/f'trim-{i}.wav'),'-af',filters,'-f','s16le','-ar','48000','-ac','1','pipe:1'],capture_output=True,check=True)
 samples=array.array('h',result.stdout)
 start=round([.05,2.58,4.05][i]*48000)
 end_limit=round([2.48,3.98,9.5][i]*48000)
 for j,s in enumerate(samples[:end_limit-start]): mix[start+j]=int(s*.85)
 print('Réplique',i,round(len(samples)/48000,3),'s')
with wave.open(str(root/'dialogue-final.wav'),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(mix.tobytes())
script=(root/'encode-video.py').read_text(encoding='utf-8-sig').replace("root/'dialogue.m4a'","root/'dialogue-final.wav'")
(root/'encode-video.py').write_text(script,encoding='utf8')
