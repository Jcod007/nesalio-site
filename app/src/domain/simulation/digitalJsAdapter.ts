/**
 * Provider-neutral circuit description -> DigitalJS netlist.
 * Reference: https://github.com/tilk/digitaljs#input-format
 * This module DOES NOT execute generated JS or trust AI-computed outputs.
 */
export type DigitalKind =
  | "INPUT" | "OUTPUT" | "CONST" | "CLOCK"
  | "NOT" | "AND" | "NAND" | "OR" | "NOR" | "XOR" | "XNOR"
  | "MUX" | "EQ" | "NE" | "LT" | "LE" | "GT" | "GE"
  | "DFF";
export type PinRef = { device: string; port: string };
export type CircuitNode = {
  id: string;
  kind: DigitalKind;
  bits?: number;
  /** Input width for each MUX data port. */
  selectBits?: number;
  value?: string;
  reset?: "synchronous" | "asynchronous";
  /** Initial register value in binary. */
  initial?: string;
};
export type CircuitWire = { from: PinRef; to: PinRef };
export type CircuitModel = { nodes: CircuitNode[]; wires: CircuitWire[] };
export type DigitalJsNetlist = {
  devices: Record<string, Record<string, unknown>>;
  connectors: Array<{from:{id:string;port:string};to:{id:string;port:string}}>;
  subcircuits: Record<string, never>;
};

const gates: Record<string, string> = {
  NOT:"Not", AND:"And", NAND:"Nand", OR:"Or", NOR:"Nor",
  XOR:"Xor", XNOR:"Xnor", MUX:"Mux", EQ:"Eq", NE:"Ne",
  LT:"Lt", LE:"Le", GT:"Gt", GE:"Ge"
};
const comparisons = new Set(["EQ","NE","LT","LE","GT","GE"]);
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const validBits = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 64;
const binary = (s: string, width: number) => s.length === width && /^[01]+$/.test(s);

function ports(node: CircuitNode): {inputs:Record<string,number>;outputs:Record<string,number>} {
  const bits = node.bits ?? 1;
  if (node.kind === "INPUT" || node.kind === "CONST" || node.kind === "CLOCK")
    return {inputs:{},outputs:{out:node.kind==="CLOCK"?1:bits}};
  if (node.kind === "OUTPUT") return {inputs:{in:bits},outputs:{}};
  if (node.kind === "DFF") return {
    inputs:{in:bits,clk:1,...(node.reset ? {[node.reset==="synchronous"?"srst":"arst"]:1}:{})},
    outputs:{out:bits}
  };
  if (node.kind === "MUX") {
    const n = node.selectBits ?? 1;
    return {inputs:{...Object.fromEntries(Array.from({length:2**n},(_,i)=>["in"+i,bits])),sel:n},outputs:{out:bits}};
  }
  if (node.kind === "NOT") return {inputs:{in:bits},outputs:{out:bits}};
  if (comparisons.has(node.kind)) return {inputs:{in1:bits,in2:bits},outputs:{out:1}};
  return {inputs:{in1:bits,in2:bits},outputs:{out:bits}};
}

export function toDigitalJs(model: CircuitModel): DigitalJsNetlist {
  if (!Array.isArray(model.nodes) || !Array.isArray(model.wires) || model.nodes.length > 1000 || model.wires.length > 10000)
    throw Error("Circuit size invalid");
  const devices: DigitalJsNetlist["devices"] = {};
  const nodes = new Map<string,CircuitNode>();
  for (const node of model.nodes) {
    const bits = node.bits ?? 1;
    if (!identifier.test(node.id) || nodes.has(node.id) || !validBits(bits) || !(node.kind in gates || ["INPUT","OUTPUT","CONST","CLOCK","DFF"].includes(node.kind)))
      throw Error("Invalid node " + node.id);
    if (node.reset && node.kind !== "DFF") throw Error("Reset is only valid on DFF");
    if (node.kind === "CLOCK" && bits !== 1) throw Error("Clock must be one bit");
    if (node.kind === "MUX" && !validBits(node.selectBits ?? 1) || node.kind === "MUX" && (node.selectBits ?? 1) > 5)
      throw Error("MUX selectBits must be 1..5");
    if (node.kind === "CONST" && !binary(node.value ?? "",bits)) throw Error("Constant must match bit width");
    if (node.kind === "DFF" && node.initial !== undefined && !binary(node.initial,bits)) throw Error("Invalid initial state");
    nodes.set(node.id,node);
    switch (node.kind) {
      case "INPUT": devices[node.id]={type:"Input",bits}; break;
      case "OUTPUT": devices[node.id]={type:"Output",bits}; break;
      case "CLOCK": devices[node.id]={type:"Clock"}; break;
      case "CONST": devices[node.id]={type:"Constant",constant:node.value}; break;
      case "DFF": devices[node.id]={
        type:"Dff",bits, "polarity.clock":true,
        ...(node.reset ? {[node.reset==="synchronous"?"polarity.srst":"polarity.arst"]:true,
          [node.reset==="synchronous"?"srst_value":"arst_value"]:"0".repeat(bits)} : {}),
        ...(node.initial !== undefined ? {initial:node.initial} : {})
      }; break;
      case "MUX": devices[node.id]={type:"Mux","bits.in":bits,"bits.sel":node.selectBits??1}; break;
      default:
        devices[node.id]=comparisons.has(node.kind)
          ? {type:gates[node.kind],"bits.in1":bits,"bits.in2":bits}
          : {type:gates[node.kind],bits,...(node.kind==="NOT"?{}:{inputs:2})};
    }
  }
  const driven = new Set<string>();
  const connectors: DigitalJsNetlist["connectors"] = [];
  for (const wire of model.wires) {
    const source = nodes.get(wire.from.device), target = nodes.get(wire.to.device);
    if (!source || !target) throw Error("Wire references missing node");
    const sourceWidth = ports(source).outputs[wire.from.port];
    const targetWidth = ports(target).inputs[wire.to.port];
    if (sourceWidth === undefined || targetWidth === undefined || sourceWidth !== targetWidth)
      throw Error("Invalid port or width mismatch: " + wire.from.device + " -> " + wire.to.device);
    const destination = wire.to.device+"."+wire.to.port;
    if (driven.has(destination)) throw Error("Multiple drivers on " + destination);
    driven.add(destination);
    connectors.push({from:{id:wire.from.device,port:wire.from.port},to:{id:wire.to.device,port:wire.to.port}});
  }
  for (const node of model.nodes) {
    for (const input of Object.keys(ports(node).inputs)) {
      if (!driven.has(node.id+"."+input)) throw Error("Unconnected input " + node.id+"."+input);
    }
  }
  // Reject combinational feedback; registered feedback through DFF is allowed.
  const dependencies = new Map<string,string[]>();
  for (const node of model.nodes) dependencies.set(node.id,[]);
  for (const w of model.wires) if (nodes.get(w.to.device)?.kind !== "DFF")
    dependencies.get(w.to.device)!.push(w.from.device);
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id:string):void => {
    if (visiting.has(id)) throw Error("Combinational cycle at " + id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of dependencies.get(id)!) visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of model.nodes) visit(node.id);
  return {devices,connectors,subcircuits:{}};
}
