from pathlib import Path
import sys,subprocess,json,array,wave
sys.path.insert(0,r'C:/Users/compt2/.codex/visualizations/2026/10/29/01a187e1-c1a7-7762-a229-204f933cfadd/video-tools')
import imageio_ffmpeg
root=Path(r'C:/Users/compt2/Desktop/nesalio-site/analyses/pitch-video-12s-2026-11-04')
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
meta=json.loads((root/'audio-timing.json').read_text())
mix=array.array('h',[0])*(48000*12)
for m in meta:
 i=m['clip'];pitch=1.1 if m['joyce'] else 1
 speed=m['duration']/pitch/m['target']
 filters=f'asetrate={int(24000*pitch)},aresample=48000,atempo={speed:.8f}'
 result=subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-i',str(root/f'trim-{i}.wav'),'-af',filters,'-f','s16le','-ar','48000','-ac','1','pipe:1'],capture_output=True,check=True)
 samples=array.array('h',result.stdout)
 start=round(m['start']*48000)
 limit=round((m['target']+.03)*48000)
 for j,sample in enumerate(samples[:limit]):
  if start+j < len(mix): mix[start+j]=int(sample*.85)
 print('Réplique',i,round(len(samples)/48000,3),'s à',m['start'],'s')
with wave.open(str(root/'dialogue-final.wav'),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(mix.tobytes())
