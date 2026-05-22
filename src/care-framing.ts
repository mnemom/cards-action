/* care-framing:meta
 *
 * This module enforces the Mnemom care-framing doctrine. The doctrine
 * lives in the source as a small list of compliance-language words to
 * keep out of customer-facing prose, plus a replacement vocabulary that
 * reads as professional care rather than refusal.
 *
 * Because this file documents the doctrine itself, every reference to a
 * compliance word inside this file is wrapped in a meta-block. The
 * scanner skips lines marked `care-framing:meta` and blocks marked
 * `care-framing:exempt-block-start` / `care-framing:exempt-block-end`.
 *
 * V7 §5.3 is canonical: compliance language activates anxiety / fear
 * vectors; care language activates calm vectors. The framing is part of
 * the mechanism's effect on the next decision.
 */

// care-framing:exempt-block-start
const FORBIDDEN_WORDS_INTERNAL = [
  'blocked',
  'denied',
  'required',
  'forbidden',
  'violation',
  'must',
  'not allowed',
  'cannot',
] as const;
// care-framing:exempt-block-end

export const FORBIDDEN_WORDS: ReadonlyArray<string> = FORBIDDEN_WORDS_INTERNAL;

// care-framing:exempt-block-start
const FORBIDDEN_WORD_PATTERN = new RegExp(
  `\\b(${FORBIDDEN_WORDS_INTERNAL.join('|')})\\b`,
  'gi',
);
// care-framing:exempt-block-end

const META_LINE = /care-framing:meta/;
const RULE_SLUG_LINE = /care-framing:rule-slug/;
const EXEMPT_START = /care-framing:exempt-block-start/;
const EXEMPT_END = /care-framing:exempt-block-end/;

export interface CareFramingViolation {
  readonly line: number;
  readonly column: number;
  readonly word: string;
  readonly context: string;
}

/**
 * Walk source-or-prose text line-by-line, honouring per-line directives,
 * and return any compliance-language matches that would benefit from
 * care-framing substitution.
 */
export function scanCareFraming(text: string): CareFramingViolation[] {
  const lines = text.split(/\r?\n/);
  const out: CareFramingViolation[] = [];
  let exempt = false;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx]!;

    if (EXEMPT_START.test(line)) {
      exempt = true;
      continue;
    }
    if (EXEMPT_END.test(line)) {
      exempt = false;
      continue;
    }
    if (exempt) continue;
    if (META_LINE.test(line)) continue;
    if (RULE_SLUG_LINE.test(line)) continue;

    const matches = line.matchAll(FORBIDDEN_WORD_PATTERN);
    for (const m of matches) {
      const word = m[0]!;
      const column = (m.index ?? 0) + 1;
      out.push({
        line: idx + 1,
        column,
        word: word.toLowerCase(),
        context: line.trim(),
      });
    }
  }

  return out;
}

/**
 * Throw if any care-framing match appears. Used as the final post-render
 * gate before posting a PR comment.
 */
export function assertCareFramed(text: string, surface: string): void {
  const findings = scanCareFraming(text);
  if (findings.length > 0) {
    const summary = findings
      .slice(0, 5)
      .map(
        (f) =>
          `  line ${f.line}:${f.column} — "${f.word}" in: ${f.context.slice(0, 80)}`,
      )
      .join('\n');
    throw new Error(
      `Care-framing self-check on ${surface} surfaced ${findings.length} substitution-candidate word(s):\n${summary}`,
    );
  }
}
