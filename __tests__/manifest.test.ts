import { describe, it, expect } from 'vitest';
import { parseManifest, isParseError } from '../src/manifest.js';
import type { ChangedManifest } from '../src/types.js';

const baseManifest = (raw: string): ChangedManifest => ({
  path: '.mnemom/agents/role-x.yaml',
  resource: 'alignment',
  scope: 'agent',
  scope_id: 'role-x',
  raw_yaml: raw,
});

describe('parseManifest', () => {
  it('parses well-formed YAML', () => {
    const result = parseManifest(baseManifest('role_id: role-x\nagent_id: smolt-x\n'));
    expect(isParseError(result)).toBe(false);
    if (!isParseError(result)) {
      expect(result.parsed['role_id']).toBe('role-x');
      expect(result.parsed['agent_id']).toBe('smolt-x');
    }
  });

  it('reports an error on malformed YAML', () => {
    const result = parseManifest(baseManifest('role_id: [unclosed'));
    expect(isParseError(result)).toBe(true);
  });

  it('reports an error on empty manifest', () => {
    const result = parseManifest(baseManifest(''));
    expect(isParseError(result)).toBe(true);
  });

  it('reports an error on top-level array', () => {
    const result = parseManifest(baseManifest('- one\n- two\n'));
    expect(isParseError(result)).toBe(true);
  });

  it('does not expand merge keys (FAILSAFE schema)', () => {
    // YAML "anchors / aliases" still resolve to strings in FAILSAFE schema.
    // What FAILSAFE rejects is implicit type coercion and arbitrary tag tags.
    const result = parseManifest(baseManifest('role_id: !!js/eval null\n'));
    // !!js/eval is a custom tag — FAILSAFE schema rejects.
    expect(isParseError(result)).toBe(true);
  });
});
