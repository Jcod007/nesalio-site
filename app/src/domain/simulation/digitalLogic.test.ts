import { describe, expect, it } from "vitest";
import { simulate, truthTable, type Circuit, type Bit } from "./digitalLogic";

const input = (id: string, value: Bit) => ({id, type: "INPUT" as const, value});
const gate = (id: string, type: "AND" | "XOR" | "MUX2", pins: Record<string,string>) => ({id,type,pins});
describe("digital logic engine", () => {
  it("computes all AND and XOR truth table rows", () => {
    const circuit: Circuit = {components: [
      input("a",0), input("b",0),
      gate("and","AND",{A:"a.Q",B:"b.Q"}),
      gate("xor","XOR",{A:"a.Q",B:"b.Q"})
    ]};
    const rows = truthTable(circuit,["a","b"],["and","xor"]);
    expect(rows.map(r=>[r.outputs.and,r.outputs.xor])).toEqual([[0,0],[0,1],[0,1],[1,0]]);
  });
  it("selects mux inputs", () => {
    const circuit: Circuit = {components: [
      input("a",0),input("b",1),input("s",1),
      gate("m","MUX2",{A:"a.Q",B:"b.Q",S:"s.Q"})
    ]};
    expect(simulate(circuit).values.m).toBe(1);
  });
  it("detects combinational cycles", () => {
    expect(()=>simulate({components:[
      {id:"a",type:"NOT",pins:{A:"b.Q"}},
      {id:"b",type:"NOT",pins:{A:"a.Q"}}
    ]})).toThrow(/cycle/);
  });
  it("DFF samples on rising edge, holds otherwise", () => {
    const make = (clk: Bit, d: Bit): Circuit => ({components:[
      input("clk",clk),input("d",d),
      {id:"ff",type:"DFF",pins:{CLK:"clk.Q",D:"d.Q"}}
    ]});
    const first=simulate(make(0,1));
    expect(first.values.ff).toBe(0);
    const second=simulate(make(1,1),first);
    expect(second.values.ff).toBe(1);
    expect(simulate(make(1,0),second).values.ff).toBe(1);
  });
  it("asynchronous reset acts without clock edge, synchronous reset waits", () => {
    const make=(mode:"sync"|"async",reset:Bit):Circuit=>({components:[
      input("clk",0),input("d",0),input("rst",reset),
      {id:"ff",type:"DFF",initial:1,resetMode:mode,pins:{CLK:"clk.Q",D:"d.Q",RESET:"rst.Q"}}
    ]});
    expect(simulate(make("async",1)).values.ff).toBe(0);
    expect(simulate(make("sync",1)).values.ff).toBe(1);
  });
  it("TFF toggles and JKFF implements toggle condition", () => {
    const circuit: Circuit={components:[
      input("clk",1),input("t",1),input("j",1),input("k",1),
      {id:"tff",type:"TFF",pins:{CLK:"clk.Q",T:"t.Q"}},
      {id:"jk",type:"JKFF",pins:{CLK:"clk.Q",J:"j.Q",K:"k.Q"}}
    ]};
    const result=simulate(circuit);
    expect(result.values.tff).toBe(1);
    expect(result.values.jk).toBe(1);
  });
});
