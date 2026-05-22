import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { scanCareFraming } from '../src/care-framing.js';

const FILES_UNDER_DOCTRINE = [
  'src/main.ts',
  'src/render.ts',
  'src/api-client.ts',
  'src/compose-diff.ts',
  'src/care-framing.ts',
  'src/ci-config.ts',
  'src/manifest.ts',
  'src/detect.ts',
  'src/simulate-cases.ts',
  'src/github.ts',
];

describe('care-framing doctrine', () => {
  it.each(FILES_UNDER_DOCTRINE)('%s is care-framed', async (rel) => {
    const abs = path.resolve(__dirname, '..', rel);
    const content = await fs.readFile(abs, 'utf8');
    const findings = scanCareFraming(content);
    if (findings.length > 0) {
      const summary = findings
        .slice(0, 8)
        .map((f) => `  line ${f.line}:${f.column} — "${f.word}" — ${f.context.slice(0, 100)}`)
        .join('\n');
      throw new Error(
        `${rel} surfaced ${findings.length} care-framing substitution candidate(s):\n${summary}\n\nWrap meta lines with \`care-framing:meta\` or whole blocks with \`care-framing:exempt-block-{start,end}\` if the word literal is doctrine-meta.`,
      );
    }
    expect(findings).toEqual([]);
  });
});
