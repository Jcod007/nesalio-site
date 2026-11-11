/** Texte visible issu des événements, y compris les champs des dessins et questions. */
function strings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

export function sessionText(report) {
  return [...(report.steps ?? []).flatMap((step) => strings([step.say, step.do, step.segments, step.check])), ...strings(report.lesson?.summary ?? [])]
    .join("\n")
    .normalize("NFC");
}

export function programCheck(q, report) {
  const text = sessionText(report);
  const used = report.lesson?.commands ?? {};
  const misses = [];
  let total = 0;
  for (const type of q.mustUse ?? []) {
    total++;
    if (!used[type]) misses.push(`commande absente : ${type}`);
  }
  for (const pattern of q.mustMention ?? []) {
    total++;
    if (!new RegExp(pattern, "iu").test(text)) misses.push(`non mentionné : ${pattern}`);
  }
  for (const pattern of q.mustNotMention ?? []) {
    total++;
    if (new RegExp(pattern, "iu").test(text)) misses.push(`interdit : ${pattern}`);
  }
  return total === 0 ? null : { score: `${total - misses.length}/${total}`, ok: total - misses.length, total, misses };
}
