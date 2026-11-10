/**
 * The parts of a formula, with the spacing the model wrote BETWEEN them. A formula written part by
 * part is laid out from its parts only, so `\quad` placed between two parts was lost: seen in a real
 * lesson (2026-11-09), « x ≈ 3,73 \quad \text{ou} \quad x ≈ 0,27 » drawn « 3,73oux ». The spacing found
 * between two parts in `content` goes at the end of the first one; a part that is a word in text
 * (`\text{ou}`) keeps a space on each side even when none was written.
 */
const SPACING = /\\(?:qquad|quad|[,;:!> ])|~/g;
const WORD = /^\\text\{[^{}]*\}$/;

export function partsWithSpacing(content: string, parts: readonly string[]): string[] {
  const texts = [...parts];
  let cursor = 0;
  const ends: (number | undefined)[] = [];
  const starts: (number | undefined)[] = [];
  for (const part of parts) {
    const at = content.indexOf(part.trim(), cursor);
    if (at < 0) {
      starts.push(undefined);
      ends.push(undefined);
      continue;
    }
    starts.push(at);
    ends.push(at + part.trim().length);
    cursor = at + part.trim().length;
  }
  for (let i = 0; i < parts.length - 1; i++) {
    const end = ends[i], next = starts[i + 1];
    const gap = end !== undefined && next !== undefined && next >= end ? content.slice(end, next) : "";
    const spacing = gap.match(SPACING)?.join(" ") ?? "";
    const word = WORD.test(parts[i]!.trim()) || WORD.test(parts[i + 1]!.trim());
    if (spacing) texts[i] = `${texts[i]} ${spacing}`;
    else if (word) texts[i] = `${texts[i]} \\ `;
  }
  return texts;
}
