from pathlib import Path
import wave,array,math,json
root=Path('analyses/pitch-video-modalites-2026-11-04')
source=Path('analyses/pitch-video-12s-2026-11-04')
meta=json.loads((source/'audio-timing.json').read_text())
with wave.open(str(source/'dialogue-final.wav'),'rb') as w:
 rate=w.getframerate();pcm=array.array('h',w.readframes(w.getnframes()))
# La seconde réponse de Joyce devient écrite, sans ajouter ni déplacer une réplique.
for i in range(round(9.80*rate),round(10.95*rate)): pcm[i]=0
with wave.open(str(root/'dialogue-final.wav'),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(pcm.tobytes())
token_lists=[
 ['Le','maximum','est','2 ?'],
 ['Tu','confonds','x','et','y','du','sommet.'],
 ['Regarde :','le','maximum,','c’est','3.'],
 ['Et','si','le','sommet','est','(4,\u00a05) ?'],
 [],
 ['Exactement !'],
]
weights=[[1,3,1,1],[1,2,1,1,2,1,2],[2,1,3,1,1],[1,1,1,2,1,2],[],[3]]
utterances=[]
for m in meta:
 i=m['clip']
 if i==4: continue
 start=m['start'];end=start+m['target']
 bin_size=round(rate*.01)
 activity=[]
 for j in range(round(start*rate),round(end*rate),bin_size):
  values=pcm[j:min(j+bin_size,len(pcm))]
  rms=math.sqrt(sum(v*v for v in values)/max(1,len(values)))
  if rms>140: activity.append(j/rate)
 if not activity: raise RuntimeError(f'Réplique sans signal {i}')
 total=sum(weights[i]);prefix=0;tokens=[]
 for text,weight in zip(token_lists[i],weights[i]):
  index=min(len(activity)-1,round(prefix/total*(len(activity)-1)))
  tokens.append({'text':text,'from':round(activity[index],4)})
  prefix+=weight
 utterances.append({'id':i,'speaker':'joyce' if i==0 else 'nesalio','start':start,
  'end':round(end,4),'activeStart':round(activity[0],4),'activeEnd':round(activity[-1]+.01,4),'tokens':tokens})
envelope=[]
for index in range(180):
 t=index/15
 values=pcm[round(t*rate):round((t+.04)*rate)]
 rms=math.sqrt(sum(v*v for v in values)/max(1,len(values)))
 envelope.append(round(min(1,rms/6500),4))
(root/'communication-timing.json').write_text(json.dumps({'utterances':utterances,'envelope':envelope},ensure_ascii=False),encoding='utf8')
print('Piste de 12 secondes, cinq répliques orales et une réponse écrite.')
