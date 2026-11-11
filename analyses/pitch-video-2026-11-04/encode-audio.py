from pathlib import Path
import json,subprocess,sys
sys.path.insert(0,r'C:/Users/compt2/.codex/visualizations/2026/10/29/01a187e1-c1a7-7762-a229-204f933cfadd/video-tools')
import imageio_ffmpeg
root=Path(r'C:/Users/compt2/Desktop/nesalio-site/analyses/pitch-video-2026-11-04')
meta=json.loads((root/'audio-timing.json').read_text())
filters=[]
for i,m in enumerate(meta):
 pitch=1.1 if i==1 else 1
 speed=m['duration']/pitch/m['target']
 rate=f'asetrate={int(24000*pitch)},aresample=48000' if i==1 else 'aresample=48000'
 delay=[50,2580,4050][i]
 filters.append(f'[{i}:a]{rate},atempo={speed:.8f},loudnorm=I=-16:TP=-1.5:LRA=7,adelay={delay}[a{i}]')
filters.append('[a0][a1][a2]amix=inputs=3:duration=longest:normalize=0,apad=whole_dur=10,atrim=duration=10[out]')
cmd=[imageio_ffmpeg.get_ffmpeg_exe(),'-y','-hide_banner','-loglevel','error']
for i in range(3): cmd+=['-i',str(root/f'trim-{i}.wav')]
cmd+=['-filter_complex',';'.join(filters),'-map','[out]','-c:a','aac','-b:a','192k',str(root/'dialogue.m4a')]
subprocess.run(cmd,check=True)
print('Dialogue de 10 secondes exporté')
