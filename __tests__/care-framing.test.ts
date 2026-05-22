import { describe, it, expect } from 'vitest';
import { scanCareFraming, assertCareFramed, FORBIDDEN_WORDS } from '../src/care-framing.js';

describe('scanCareFraming', () => {
  it('flags a forbidden word in plain prose', () => {
    const findings = scanCareFraming('This action is blocked from running.');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.word).toBe('blocked');
    expect(findings[0]?.line).toBe(1);
  });

  it('returns an empty list for care-framed prose', () => {
    const findings = scanCareFraming(
      'This action would benefit from a fresh consultation before retry.',
    );
    expect(findings).toEqual([]);
  });

  it('skips lines marked care-framing:meta', () => {
    const text = [
      'normal prose',
      'sample care-framing:meta — discusses blocked, denied, forbidden',
      'another normal line',
    ].join('\n');
    const findings = scanCareFraming(text);
    expect(findings).toEqual([]);
  });

  it('skips blocks between exempt-block markers', () => {
    const text = [
      'normal prose',
      '// care-framing:exempt-block-start',
      'const FORBIDDEN = ["blocked", "denied", "must"];',
      '// care-framing:exempt-block-end',
      'tail prose',
    ].join('\n');
    const findings = scanCareFraming(text);
    expect(findings).toEqual([]);
  });

  it('flags multiple matches on one line', () => {
    const findings = scanCareFraming('blocked and denied both forbidden');
    expect(findings.length).toBe(3);
  });

  it('is case-insensitive', () => {
    const findings = scanCareFraming('This Must be addressed.');
    expect(findings.length).toBe(1);
    expect(findings[0]?.word).toBe('must');
  });
});

describe('assertCareFramed', () => {
  it('returns silently on care-framed text', () => {
    expect(() => assertCareFramed('care-framed prose only', 'test')).not.toThrow();
  });

  it('throws on care-framing-substitution candidates', () => {
    expect(() => assertCareFramed('blocked', 'test')).toThrow(/Care-framing self-check/);
  });
});

describe('FORBIDDEN_WORDS', () => {
  it('exposes the core compliance-language list', () => {
    expect(FORBIDDEN_WORDS.length).toBeGreaterThanOrEqual(6);
  });
});
