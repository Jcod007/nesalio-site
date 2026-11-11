from pathlib import Path
import sys,subprocess
sys.path.insert(0,r'C:/Users/compt2/.codex/visualizations/2026/10/29/01a187e1-c1a7-7762-a229-204f933cfadd/video-tools')
import imageio_ffmpeg
root=Path(r'C:/Users/compt2/Desktop/nesalio-site/analyses/pitch-video-modalites-2026-11-04')
out=Path(r'C:/Users/compt2/.codex/visualizations/2026/10/29/01a187e1-c1a7-7762-a229-204f933cfadd/nesalio-joyce-12s-interactions-claires.mp4')
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
for i in range(180):
 if not (root/f'frames/{i:03d}.jpg').exists(): raise RuntimeError(f'Image manquante {i}')
subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-framerate','15','-i',str(root/'frames/%03d.jpg'),'-i',str(root/'dialogue-final.wav'),'-map','0:v:0','-map','1:a:0','-vf','fps=30,scale=iw:ih:in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p','-c:v','libx264','-preset','medium','-crf','18','-profile:v','high','-level:v','4.1','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-ar','48000','-t','12','-movflags','+faststart',str(out)],check=True)
result=subprocess.run([ffmpeg,'-hide_banner','-i',str(out)],capture_output=True,text=True)
for line in result.stderr.splitlines():
 if 'Duration' in line or 'Stream #' in line: print(line)
print('Taille',round(out.stat().st_size/1024/1024,2),'Mo')
for second in (0.5,1.8,4.8,10.3,11.5):
 subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-ss',str(second),'-i',str(out),'-frames:v','1',str(root/f'controle-{second}.jpg')],check=True)
