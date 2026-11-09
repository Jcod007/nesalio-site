from pathlib import Path
import wave,array,math,json
folder=Path('analyses/pitch-video-12s-2026-11-04')
starts=[.05,1.12,3.55,8.02,9.85,11.07]
targets=[.94,1.70,2.15,1.74,1.02,.8]
metadata=[]
for i in range(6):
 with wave.open(str(folder/(f'voice-{i}-alt.wav' if i == 4 else f'voice-{i}.wav')),'rb') as w:
  channels=w.getnchannels();rate=w.getframerate();width=w.getsampwidth();pcm=w.readframes(w.getnframes())
 samples=array.array('h',pcm);window=int(rate*.01)*channels
 energy=[math.sqrt(sum(v*v for v in samples[j:j+window])/max(1,len(samples[j:j+window]))) for j in range(0,len(samples),window)]
 active=[j for j,e in enumerate(energy) if e>160]
 start=max(0,active[0]*window-int(.035*rate)*channels)
 end=min(len(samples),(active[-1]+1)*window+int(.075*rate)*channels)
 with wave.open(str(folder/f'trim-{i}.wav'),'wb') as out:
  out.setnchannels(channels);out.setsampwidth(width);out.setframerate(rate);out.writeframes(samples[start:end].tobytes())
 duration=(end-start)/channels/rate
 metadata.append({'clip':i,'duration':duration,'start':starts[i],'target':targets[i],'joyce':i in (0,4)})
 print(i,round(duration,3),'s vers',targets[i],'s')
(folder/'audio-timing.json').write_text(json.dumps(metadata),encoding='utf8')
