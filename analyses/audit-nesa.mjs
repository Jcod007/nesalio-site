import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), 'rea-private', process.env.NESALIO_AUDIT_FOLDER ?? 'audit-pedagogique');
const target = process.env.NESALIO_AUDIT_URL ?? 'https://nesalio-app.vercel.app';
await mkdir(out, { recursive: true });
const cases = [
  ...['aide-repetee', 'erreur-thales'].map(id => ({ id, question: 'Explique le théorème de Thalès.', request: {
    mode: 'continue', question: 'Explique le théorème de Thalès.',
    answer: { prompt: 'SA = 6, SD = 2 et AB = 9. Que vaut DE ?', choices: ['3', '27'], picked: id === 'aide-repetee' ? 'Je ne sais toujours pas. Explique-moi autrement.' : '27', correct: id === 'aide-repetee' ? null : false, concept: 'thales.ratios', support: 'guided' },
    context: { originalQuestion: 'Explique le théorème de Thalès.', spoken: ['SD/SA = DE/AB.'], board: [], learning: { v: 1, concepts: [{ id: 'thales.ratios', presented: ['explanation', 'worked-example'], observations: Array.from({length: id === 'aide-repetee' ? 2 : 1}, () => ({task: 'Calculer DE', outcome: id === 'aide-repetee' ? 'help-requested' : 'incorrect', format: id === 'aide-repetee' ? 'free' : 'choice', support: 'guided'})) }] } },
  } })),
  { id: 'novice-thales', question: 'Explique-moi le théorème de Thalès depuis zéro. Je ne sais pas identifier les points ni pourquoi on utilise deux triangles. Montre-moi un exemple entièrement résolu, en justifiant chaque étape.' },
  { id: 'novice-derivee', question: 'Je ne connais absolument rien aux dérivées. Explique-moi depuis zéro ce que cela veut dire, avec un exemple concret et un dessin. Ne me demande pas de deviner une notion que tu ne m’as pas encore expliquée.' },
  { id: 'novice-fraction', question: 'Je débute complètement : je ne comprends même pas ce que sont le numérateur et le dénominateur. Explique-moi ce qu’est une fraction et comment on additionne 1/2 et 1/3. Commence par les bases et montre-moi un exemple.' },
  { id: 'novice-fonction', question: 'Je ne sais pas ce que veut dire fonction. Je ne connais ni les axes ni les coordonnées. Explique-moi très simplement depuis le début, avec un exemple concret.' },
  { id: 'explication-sans-quiz', question: 'Je connais les équations du second degré et la factorisation. Explique-moi directement comment compléter le carré pour x² − 4x + 3, sans quiz et sans me poser de questions.' },
  { id: 'espace-plan-incline', question: 'Explique avec un schéma les forces sur un bloc de 2 kg sur un plan incliné à 30°, avec frottement de coefficient 0,2, puis calcule son accélération. Nomme chaque force, ses composantes et ses unités.' },
];

async function run(test) {
  const started = performance.now();
  let firstMs = null;
  let firstStepMs = null;
  const response = await fetch(target.replace(/\/$/, '') + '/api/tutor', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(test.request ?? { mode: 'question', question: test.question }),
    signal: AbortSignal.timeout(180000),
  });
  let raw = '';
  let pending = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    if (firstMs === null) firstMs = Math.round(performance.now() - started);
    const decoded = decoder.decode(chunk, { stream: true });
    raw += decoded;
    pending += decoded;
    let boundary;
    while ((boundary = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, boundary);
      pending = pending.slice(boundary + 1);
      try { if (firstStepMs === null && JSON.parse(line).kind === 'step') firstStepMs = Math.round(performance.now() - started); } catch {}
    }
  }
  raw += decoder.decode();
  const events = raw.split(/\r?\n/).filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return { kind: 'parse-failure', raw: line }; }
  });
  const steps = events.filter(e => e.kind === 'step');
  const firstCheck = steps.findIndex(e => e.check);
  const result = {
    ...test, httpStatus: response.status, firstResponseChunkMs: firstMs, firstStepMs,
    totalMs: Math.round(performance.now() - started),
    source: events.find(e => e.kind === 'source')?.source,
    steps: steps.length, firstCheckAfterSteps: firstCheck < 0 ? null : firstCheck + 1,
    wordsUpToFirstCheck: steps.slice(0, firstCheck < 0 ? undefined : firstCheck + 1)
      .reduce((n,e) => n + e.say.split(/\s+/).length, 0),
    check: steps.find(e => e.check)?.check ?? null,
    spoken: steps.map(e => e.say),
    drawings: steps.map(e => e.do),
    terminal: events.at(-1)?.kind,
    rejected: events.filter(e => e.kind === 'await').flatMap(e => e.rejected ?? []),
    events,
  };
  await writeFile(resolve(out, test.id + '.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, drawings: undefined, events: undefined }));
  return result;
}

const results = [];
for (const test of cases.filter(test => !process.env.NESALIO_AUDIT_CASES || process.env.NESALIO_AUDIT_CASES.split(',').includes(test.id))) results.push(await run(test));
await writeFile(resolve(out, 'summary.json'), JSON.stringify(results.map(({events, ...r}) => r), null, 2));
