const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../app');
const src = path.join(root, 'src');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);
const files = walk(src).filter((f) => !f.includes('.test.'));
const all = [...files, ...walk(path.join(root, 'tools'))];
const info = new Map();
function resolve(from, spec) {
  const base = spec.startsWith('@/') ? path.join(src, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  return base && [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find((p) => fs.existsSync(p));
}
for (const file of all) {
  const text = fs.readFileSync(file, 'utf8');
  const deps = [];
  const runtimeDeps = [];
  const exports = [];
  for (const match of text.matchAll(/(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s*["']([^"']+)["']/g)) {
    const dep = resolve(file, match[3]);
    if (dep) { deps.push(dep); if (!match[1]) runtimeDeps.push(dep); }
  }
  for (const match of text.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const dep = resolve(file, match[1]);
    if (dep) { deps.push(dep); runtimeDeps.push(dep); }
  }
  for (const match of text.matchAll(/export\s+(?:const|function|class|interface|type)\s+(\w+)/g)) exports.push(match[1]);
  info.set(file, { deps: [...new Set(deps)], runtimeDeps: [...new Set(runtimeDeps)], exports, lines: text.split('\n').length });
}
const entries = files.filter((f) => path.relative(src, f).startsWith('app' + path.sep) && /(?:page|layout|route)\.tsx?$/.test(f) || f.endsWith(path.sep + 'proxy.ts'));
const reached = new Set();
function reach(file) { if (reached.has(file)) return; reached.add(file); for (const dep of info.get(file)?.deps ?? []) reach(dep); }
entries.forEach(reach);
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const cycles = [];
const active = new Set();
const visited = new Set();
function cycle(file, stack) {
  if (active.has(file)) { const start = stack.indexOf(file); cycles.push([...stack.slice(start), file].map(rel)); return; }
  if (visited.has(file)) return;
  active.add(file);
  for (const dep of info.get(file)?.runtimeDeps ?? []) cycle(dep, [...stack, file]);
  active.delete(file); visited.add(file);
}
files.forEach((f) => cycle(f, []));
const inbound = new Map();
for (const [file, value] of info) for (const dep of value.deps) inbound.set(dep, [...inbound.get(dep) ?? [], file]);
const words = new Map([...info.keys()].map((file) => [file, fs.readFileSync(file, 'utf8').match(/[A-Za-z_$][\w$]*/g) ?? []]));
const exportCandidates = files.filter((file) => !entries.includes(file)).flatMap((file) => info.get(file).exports
  .filter((name) => words.get(file).filter((word) => word === name).length === 1
    && ![...words].some(([other, tokens]) => other !== file && tokens.includes(name)))
  .map((name) => ({ file: rel(file), name })));
const report = {
  files: files.length,
  entrypoints: entries.map(rel),
  unreachableFromApp: files.filter((f) => !reached.has(f)).map((f) => ({ file: rel(f), importedBy: (inbound.get(f) ?? []).map(rel) })),
  cycles,
  exportCandidates,
  layerViolations: [...info].flatMap(([file, value]) => value.deps.filter((dep) => rel(file).startsWith('src/domain/') && /^(src\/(ui|services|server|engine|content))\//.test(rel(dep)) || rel(file).startsWith('src/engine/') && /^(src\/(ui|services|server|content))\//.test(rel(dep))).map((dep) => ({ from: rel(file), to: rel(dep) }))),
  modules: files.map((f) => ({ file: rel(f), ...info.get(f), deps: info.get(f).deps.map(rel), runtimeDeps: info.get(f).runtimeDeps.map(rel), importedBy: (inbound.get(f) ?? []).map(rel) }))
};
fs.writeFileSync(path.join(__dirname, 'inventory.json'), JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({ ...report, modules: undefined }, null, 2));
