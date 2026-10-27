import {describe,expect,it} from "vitest";
import {toDigitalJs,type CircuitModel} from "./digitalJsAdapter";
const wire=(a:string,ap:string,b:string,bp:string)=>({from:{device:a,port:ap},to:{device:b,port:bp}});
describe("DigitalJS netlist generation",()=>{
  it("generates an AND circuit from structured nodes",()=>{
    const model:CircuitModel={nodes:[
      {id:"a",kind:"INPUT"},{id:"b",kind:"INPUT"},
      {id:"g",kind:"AND"},{id:"y",kind:"OUTPUT"}
    ],wires:[wire("a","out","g","in1"),wire("b","out","g","in2"),wire("g","out","y","in")]};
    const netlist=toDigitalJs(model);
    expect(netlist.devices.g).toEqual({type:"And",bits:1,inputs:2});
    expect(netlist.connectors).toHaveLength(3);
  });
  it("generates 8-bit comparator",()=>{
    const model:CircuitModel={nodes:[
      {id:"a",kind:"INPUT",bits:8},{id:"b",kind:"INPUT",bits:8},
      {id:"cmp",kind:"LT",bits:8},{id:"y",kind:"OUTPUT"}
    ],wires:[wire("a","out","cmp","in1"),wire("b","out","cmp","in2"),wire("cmp","out","y","in")]};
    expect(toDigitalJs(model).devices.cmp).toMatchObject({type:"Lt","bits.in1":8,"bits.in2":8});
  });
  it.each(["synchronous","asynchronous"] as const)("generates DFF with %s reset",reset=>{
    const model:CircuitModel={nodes:[
      {id:"d",kind:"INPUT"},{id:"clk",kind:"CLOCK"},{id:"rst",kind:"INPUT"},
      {id:"ff",kind:"DFF",reset,initial:"0"},{id:"q",kind:"OUTPUT"}
    ],wires:[wire("d","out","ff","in"),wire("clk","out","ff","clk"),
      wire("rst","out","ff",reset==="synchronous"?"srst":"arst"),
      wire("ff","out","q","in")]};
    expect(toDigitalJs(model).devices.ff).toMatchObject({type:"Dff","polarity.clock":true,
      [reset==="synchronous"?"polarity.srst":"polarity.arst"]:true});
  });
  it("rejects mismatched bus widths",()=>{
    expect(()=>toDigitalJs({nodes:[{id:"a",kind:"INPUT",bits:8},{id:"y",kind:"OUTPUT",bits:4}],wires:[wire("a","out","y","in")]})).toThrow(/width mismatch/);
  });
  it("rejects multiple drivers",()=>{
    expect(()=>toDigitalJs({nodes:[{id:"a",kind:"INPUT"},{id:"b",kind:"INPUT"},{id:"y",kind:"OUTPUT"}],
      wires:[wire("a","out","y","in"),wire("b","out","y","in")]})).toThrow(/Multiple drivers/);
  });
  it("rejects combinational feedback",()=>{
    expect(()=>toDigitalJs({nodes:[{id:"a",kind:"NOT"},{id:"b",kind:"NOT"}],
      wires:[wire("a","out","b","in"),wire("b","out","a","in")]})).toThrow(/cycle/);
  });
  it("rejects incomplete circuits",()=>{
    expect(()=>toDigitalJs({nodes:[{id:"a",kind:"AND"}],wires:[]})).toThrow(/Unconnected input/);
  });
  it("generates 4:1 mux with 2-bit select",()=>{
    const nodes:CircuitModel["nodes"]=[...Array.from({length:4},(_,i)=>({id:"d"+i,kind:"INPUT" as const,bits:4})),
      {id:"s",kind:"INPUT",bits:2},{id:"m",kind:"MUX",bits:4,selectBits:2},{id:"y",kind:"OUTPUT",bits:4}];
    const wires=[...Array.from({length:4},(_,i)=>wire("d"+i,"out","m","in"+i)),wire("s","out","m","sel"),wire("m","out","y","in")];
    expect(toDigitalJs({nodes,wires}).devices.m).toEqual({type:"Mux","bits.in":4,"bits.sel":2});
  });
});
