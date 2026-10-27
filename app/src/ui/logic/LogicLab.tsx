"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {simulate,type Bit,type Circuit,type Snapshot} from "@/domain/simulation/digitalLogic";
import {toDigitalJs,type CircuitModel} from "@/domain/simulation/digitalJsAdapter";

type Example = "dff" | "counter" | "mux";
const wire=(device:string,port:string,target:string,input:string)=>({from:{device,port},to:{device:target,port:input}});
function describe(example:Example):CircuitModel {
  if(example==="mux") return {nodes:[
    {id:"A",kind:"INPUT"},{id:"B",kind:"INPUT"},{id:"SEL",kind:"INPUT"},
    {id:"MUX",kind:"MUX"},{id:"Y",kind:"OUTPUT"}
  ],wires:[wire("A","out","MUX","in0"),wire("B","out","MUX","in1"),
    wire("SEL","out","MUX","sel"),wire("MUX","out","Y","in")]};
  if(example==="counter") return {nodes:[
    {id:"CLK",kind:"CLOCK"},{id:"RST",kind:"INPUT"},{id:"ONE",kind:"CONST",value:"1"},
    {id:"Q0",kind:"DFF",reset:"asynchronous",initial:"0"},
    {id:"Q1",kind:"DFF",reset:"asynchronous",initial:"0"},
    {id:"X0",kind:"XOR"},{id:"X1",kind:"XOR"},
    {id:"OUT0",kind:"OUTPUT"},{id:"OUT1",kind:"OUTPUT"}
  ],wires:[
    wire("CLK","out","Q0","clk"),wire("CLK","out","Q1","clk"),
    wire("RST","out","Q0","arst"),wire("RST","out","Q1","arst"),
    wire("ONE","out","X0","in1"),wire("Q0","out","X0","in2"),wire("X0","out","Q0","in"),
    wire("Q0","out","X1","in1"),wire("Q1","out","X1","in2"),wire("X1","out","Q1","in"),
    wire("Q0","out","OUT0","in"),wire("Q1","out","OUT1","in")
  ]};
  return {nodes:[
    {id:"D",kind:"INPUT"},{id:"CLK",kind:"CLOCK"},{id:"RST",kind:"INPUT"},
    {id:"FF",kind:"DFF",reset:"asynchronous",initial:"0"},
    {id:"Q",kind:"OUTPUT"}
  ],wires:[wire("D","out","FF","in"),wire("CLK","out","FF","clk"),
    wire("RST","out","FF","arst"),wire("FF","out","Q","in")]};
}
function buildLogic(example:Example,values:Record<string,Bit>):Circuit {
  if(example==="mux") return {components:[
    {id:"A",type:"INPUT",value:values.A},{id:"B",type:"INPUT",value:values.B},
    {id:"SEL",type:"INPUT",value:values.SEL},
    {id:"MUX",type:"MUX2",pins:{A:"A.Q",B:"B.Q",S:"SEL.Q"}},
    {id:"Y",type:"OR",pins:{A:"MUX.Q",B:"ZERO.Q"}},
    {id:"ZERO",type:"CONST",value:0}
  ]};
  if(example==="counter") return {components:[
    {id:"CLK",type:"INPUT",value:values.CLK},{id:"RST",type:"INPUT",value:values.RST},
    {id:"ONE",type:"CONST",value:1},
    {id:"Q0",type:"TFF",pins:{CLK:"CLK.Q",T:"ONE.Q",RESET:"RST.Q"},resetMode:"async"},
    {id:"Q1",type:"TFF",pins:{CLK:"CLK.Q",T:"Q0.Q",RESET:"RST.Q"},resetMode:"async"}
  ]};
  return {components:[
    {id:"D",type:"INPUT",value:values.D},{id:"CLK",type:"INPUT",value:values.CLK},
    {id:"RST",type:"INPUT",value:values.RST},
    {id:"FF",type:"DFF",pins:{D:"D.Q",CLK:"CLK.Q",RESET:"RST.Q"},resetMode:"async"}
  ]};
}
const defaults:Record<Example,Record<string,Bit>>={
  dff:{D:1,CLK:0,RST:0},counter:{CLK:0,RST:0},mux:{A:0,B:1,SEL:0}
};
export default function LogicLab() {
  const [example,setExample]=useState<Example>("dff");
  const [values,setValues]=useState<Record<string,Bit>>({...defaults.dff});
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [history,setHistory]=useState<Array<{label:string;signals:Record<string,Bit>}>>([]);
  const [speaking,setSpeaking]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const previous=useRef<Snapshot|undefined>(undefined);
  const model=useMemo(()=>describe(example),[example]);
  const netlist=useMemo(()=>toDigitalJs(model),[model]);
  const signals=snapshot?.values??{};
  const reset=(name:Example)=>{
    speechSynthesis.cancel();setSpeaking(false);setExample(name);
    const initial={...defaults[name]};setValues(initial);
    previous.current=undefined;
    const result=simulate(buildLogic(name,initial));
    previous.current=result;setSnapshot(result);setHistory([{label:"Initial",signals:result.values}]);setError(null);
  };
  useEffect(()=>{reset("dff");return ()=>speechSynthesis.cancel();},[]);
  const apply=(patch:Record<string,Bit>,label:string)=>{
    const next={...values,...patch};
    try{
      const result=simulate(buildLogic(example,next),previous.current);
      previous.current=result;setValues(next);setSnapshot(result);
      setHistory(h=>[...h.slice(-19),{label,signals:{...result.values}}]);
      setError(null);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const explanation=example==="dff"
    ? `La bascule D mémorise son entrée au front montant de l'horloge. D vaut ${values.D}, l'horloge vaut ${values.CLK} et Q vaut ${signals.FF??0}. Le reset asynchrone remet Q à zéro sans attendre le front.`
    : example==="counter"
    ? `Le compteur binaire synchrone possède deux bits. Son état est ${signals.Q1??0}${signals.Q0??0}. Q zéro bascule à chaque front montant et Q un bascule si l'ancien Q zéro valait un. Le reset agit immédiatement.`
    : `Le multiplexeur sélectionne l'entrée ${values.SEL?"B":"A"}. Sa sortie vaut ${signals.MUX??0}. Le sélecteur décide quel signal traverse le circuit.`;
  const speak=()=>{
    if(!("speechSynthesis" in window)){setError("Synthèse vocale indisponible dans ce navigateur.");return;}
    speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(explanation);utterance.lang="fr-CA";utterance.rate=.9;
    utterance.onend=()=>setSpeaking(false);utterance.onerror=()=>setSpeaking(false);
    speechSynthesis.speak(utterance);setSpeaking(true);
  };
  const ids=model.nodes.map(n=>n.id);
  const columns=example==="counter"?4:3;
  const positions=Object.fromEntries(ids.map((id,i)=>[id,{x:90+(i%columns)*200,y:75+Math.floor(i/columns)*110}]));
  const height=120+Math.ceil(ids.length/columns)*110;
  return <main style={{maxWidth:1050,margin:"0 auto",padding:"32px 20px",fontFamily:"system-ui"}}>
    <h1>Laboratoire de logique numérique</h1>
    <p>Prototype isolé : circuits générés à partir de descriptions structurées, validation DigitalJS et simulation déterministe locale. Aucun changement au lecteur pédagogique principal.</p>
    <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:18}}>
      <label>Exemple : <select value={example} onChange={e=>reset(e.target.value as Example)} aria-label="Choisir un circuit">
        <option value="dff">Bascule D avec reset asynchrone</option>
        <option value="counter">Compteur synchrone 2 bits</option>
        <option value="mux">Multiplexeur 2 vers 1</option>
      </select></label>
      <button onClick={speaking?()=>{speechSynthesis.cancel();setSpeaking(false);}:speak}>{speaking?"Arrêter la voix":"Écouter l'explication"}</button>
      <button onClick={()=>reset(example)}>Réinitialiser</button>
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:18}}>
      {Object.keys(values).filter(k=>k!=="CLK").map(k=><button key={k} onClick={()=>apply({[k]:values[k]===1?0:1},k+" modifié")} aria-label={`Basculer ${k}`}>{k} = {values[k]}</button>)}
      {example!=="mux"&&<button onClick={()=>{
        if(values.CLK===1)apply({CLK:0},"Horloge basse");
        else apply({CLK:1},"Front montant");
      }}>CLK = {values.CLK} · {values.CLK?"Front descendant":"Front montant"}</button>}
    </div>
    <div style={{overflowX:"auto",border:"1px solid #8885",borderRadius:12,padding:8}}>
      <svg viewBox={`0 0 790 ${height}`} style={{width:"100%",minWidth:550}} role="img" aria-label="Schéma du circuit numérique">
        {model.wires.map((w,i)=>{const a=positions[w.from.device],b=positions[w.to.device];if(!a||!b)return null;
          const active=signals[w.from.device]===1;
          return <path key={i} d={`M${a.x+55} ${a.y} L${(a.x+b.x)/2} ${a.y} L${(a.x+b.x)/2} ${b.y} L${b.x-55} ${b.y}`}
            fill="none" stroke={active?"#16a34a":"#64748b"} strokeWidth="2.5" opacity=".85"/>;
        })}
        {model.nodes.map(n=>{const p=positions[n.id]!;return <g key={n.id} transform={`translate(${p.x},${p.y})`}>
          <rect x="-54" y="-28" width="108" height="56" rx="9" fill={signals[n.id]===1?"#dcfce7":"#f1f5f9"} stroke={signals[n.id]===1?"#16a34a":"#64748b"} strokeWidth="2"/>
          <text textAnchor="middle" y="-4" fontSize="12" fontWeight="bold" fill="#0f172a">{n.id}</text>
          <text textAnchor="middle" y="15" fontSize="11" fill="#334155">{n.kind} · {signals[n.id]??"—"}</text>
        </g>})}
      </svg>
    </div>
    <section aria-live="polite" style={{marginTop:20,padding:18,border:"1px solid #8885",borderRadius:12}}>
      <h2 style={{fontSize:18}}>Explication</h2><p>{explanation}</p>
      <h2 style={{fontSize:18}}>Historique des transitions</h2>
      <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%"}}><thead><tr>
        <th style={{textAlign:"left"}}>Événement</th>{Object.keys(signals).map(k=><th key={k}>{k}</th>)}
      </tr></thead><tbody>{history.map((row,i)=><tr key={i}><td>{row.label}</td>{Object.keys(signals).map(k=><td key={k} style={{textAlign:"center"}}>{row.signals[k]}</td>)}</tr>)}</tbody></table></div>
      {error&&<p role="alert" style={{color:"crimson"}}>{error}</p>}
    </section>
    <details style={{marginTop:16}}><summary>Voir la netlist DigitalJS validée</summary><pre style={{overflowX:"auto"}}>{JSON.stringify(netlist,null,2)}</pre></details>
    <p style={{fontSize:12,opacity:.7}}>Limites : affichage SVG de démonstration ; le runtime DigitalJS et la voix Nesa ne sont pas encore branchés. La synthèse vocale utilise celle du navigateur.</p>
  </main>;
}
