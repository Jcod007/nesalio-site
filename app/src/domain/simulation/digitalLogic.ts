/** Deterministic, pure digital logic simulator. No model-generated executable code. */
export type Bit = 0 | 1;
export type GateType = "INPUT" | "CONST" | "NOT" | "AND" | "NAND" | "OR" | "NOR" | "XOR" | "XNOR" | "MUX2" | "DFF" | "TFF" | "JKFF" | "SRFF";
export interface Component {
  id: string;
  type: GateType;
  /** Named source pins, e.g. { D: "source.Q", CLK: "clock.Q" }. */
  pins?: Record<string, string>;
  value?: Bit;
  /** For sequential components, reset is active high and takes priority. */
  resetMode?: "sync" | "async";
  initial?: Bit;
}
export interface Circuit { components: Component[] }
export interface Snapshot { values: Record<string, Bit>; state: Record<string, Bit>; }
const inputs: Record<GateType, string[]> = {
  INPUT: [], CONST: [], NOT: ["A"], AND: ["A","B"], NAND: ["A","B"],
  OR: ["A","B"], NOR: ["A","B"], XOR: ["A","B"], XNOR: ["A","B"],
  MUX2: ["A","B","S"], DFF: ["D","CLK"], TFF: ["T","CLK"],
  JKFF: ["J","K","CLK"], SRFF: ["S","R","CLK"]
};
const sequential = new Set<GateType>(["DFF","TFF","JKFF","SRFF"]);
const bit = (value: number): Bit => value ? 1 : 0;
export function validateCircuit(circuit: Circuit): void {
  if (!Array.isArray(circuit.components) || circuit.components.length > 1000) throw Error("Invalid component count");
  const ids = new Set<string>();
  for (const c of circuit.components) {
    if (!c.id || ids.has(c.id) || !(c.type in inputs)) throw Error("Invalid or duplicate component: " + c.id);
    ids.add(c.id);
  }
  for (const c of circuit.components) {
    if ((c.type === "INPUT" || c.type === "CONST") && c.value !== 0 && c.value !== 1) throw Error("Missing input value: " + c.id);
    for (const pin of inputs[c.type]) {
      if (!c.pins?.[pin]) throw Error("Missing pin " + c.id + "." + pin);
    }
    for (const [pin, source] of Object.entries(c.pins ?? {})) {
      if (!inputs[c.type].includes(pin) && pin !== "RESET") throw Error("Unknown pin " + pin);
      if (!source.endsWith(".Q") || !ids.has(source.slice(0, -2))) throw Error("Unknown source " + source);
    }
    if (c.resetMode && !sequential.has(c.type)) throw Error("Reset on non-sequential component");
    if (c.resetMode && !c.pins?.RESET) throw Error("Reset mode requires RESET pin");
  }
}
export function simulate(circuit: Circuit, previous?: Snapshot): Snapshot {
  validateCircuit(circuit);
  const byId = new Map(circuit.components.map(c => [c.id, c]));
  const values: Record<string, Bit> = {};
  const state: Record<string, Bit> = {};
  const visiting = new Set<string>();
  const old = (id: string): Bit => previous?.state[id] ?? byId.get(id)?.initial ?? 0;
  const resolve = (id: string): Bit => {
    if (values[id] !== undefined) return values[id];
    const c = byId.get(id);
    if (!c) throw Error("Unknown component " + id);
    if (visiting.has(id)) throw Error("Combinational cycle at " + id);
    visiting.add(id);
    const pin = (name: string): Bit => resolve(c.pins![name]!.slice(0, -2));
    let q: Bit;
    switch (c.type) {
      case "INPUT": case "CONST": q = c.value!; break;
      case "NOT": q = bit(1 - pin("A")); break;
      case "AND": q = bit(pin("A") & pin("B")); break;
      case "NAND": q = bit(1 - (pin("A") & pin("B"))); break;
      case "OR": q = bit(pin("A") | pin("B")); break;
      case "NOR": q = bit(1 - (pin("A") | pin("B"))); break;
      case "XOR": q = bit(pin("A") ^ pin("B")); break;
      case "XNOR": q = bit(1 - (pin("A") ^ pin("B"))); break;
      case "MUX2": q = pin("S") ? pin("B") : pin("A"); break;
      default: q = old(id); break;
    }
    visiting.delete(id);
    values[id] = q;
    return q;
  };
  // First settle all combinational nodes against the previous register state.
  for (const c of circuit.components) resolve(c.id);
  for (const c of circuit.components) {
    if (!sequential.has(c.type)) continue;
    const pin = (name: string): Bit => values[c.pins![name]!.slice(0, -2)]!;
    const reset = c.pins?.RESET ? values[c.pins.RESET.slice(0, -2)] : 0;
    const clockId = c.pins!.CLK!.slice(0, -2);
    const rising = (previous?.values[clockId] ?? 0) === 0 && values[clockId] === 1;
    let next = old(c.id);
    if (c.resetMode === "async" && reset) next = 0;
    else if (rising) {
      if (c.resetMode === "sync" && reset) next = 0;
      else switch (c.type) {
        case "DFF": next = pin("D"); break;
        case "TFF": next = bit(next ^ pin("T")); break;
        case "JKFF": {
          const j = pin("J"), k = pin("K");
          next = j && k ? bit(1 - next) : j ? 1 : k ? 0 : next;
          break;
        }
        case "SRFF": {
          const s = pin("S"), r = pin("R");
          if (s && r) throw Error("Invalid SR state: S=R=1");
          next = s ? 1 : r ? 0 : next;
          break;
        }
      }
    }
    state[c.id] = next;
  }
  // Outputs represent the updated state; re-evaluate downstream combinational logic.
  const finalValues: Record<string, Bit> = {};
  const active = new Set<string>();
  const final = (id: string): Bit => {
    if (finalValues[id] !== undefined) return finalValues[id];
    if (active.has(id)) throw Error("Combinational cycle at " + id);
    active.add(id);
    const c = byId.get(id)!;
    const p = (name: string) => final(c.pins![name]!.slice(0, -2));
    let v: Bit;
    switch (c.type) {
      case "INPUT": case "CONST": v = c.value!; break;
      case "NOT": v = bit(1-p("A")); break;
      case "AND": v = bit(p("A") & p("B")); break;
      case "NAND": v = bit(1-(p("A") & p("B"))); break;
      case "OR": v = bit(p("A") | p("B")); break;
      case "NOR": v = bit(1-(p("A") | p("B"))); break;
      case "XOR": v = bit(p("A") ^ p("B")); break;
      case "XNOR": v = bit(1-(p("A") ^ p("B"))); break;
      case "MUX2": v = p("S") ? p("B") : p("A"); break;
      default: v = state[id]!; break;
    }
    active.delete(id);
    finalValues[id] = v;
    return v;
  };
  for (const c of circuit.components) final(c.id);
  return {values: finalValues, state};
}
export function truthTable(circuit: Circuit, inputIds: string[], outputIds: string[]) {
  if (inputIds.length > 12) throw Error("Truth table limited to 12 inputs");
  if (circuit.components.some(c => sequential.has(c.type))) throw Error("Sequential circuits need clocked simulation");
  return Array.from({length: 2 ** inputIds.length}, (_, n) => {
    const components = circuit.components.map(c => {
      const index = inputIds.indexOf(c.id);
      return index < 0 ? c : {...c, value: bit((n >> (inputIds.length - 1 - index)) & 1)};
    });
    const result = simulate({components});
    return {inputs: Object.fromEntries(inputIds.map(id => [id, components.find(c => c.id === id)!.value])), outputs: Object.fromEntries(outputIds.map(id => [id, result.values[id]]))};
  });
}
