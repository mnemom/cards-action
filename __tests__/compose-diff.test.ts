import { describe, it, expect } from 'vitest';
import { buildComposeDiff, projectManifest } from '../src/compose-diff.js';
import type { ParsedManifest } from '../src/manifest.js';
import type { ChangedManifest, EffectiveResponse } from '../src/types.js';

function alignmentManifest(parsed: Record<string, unknown>): ParsedManifest {
  const source: ChangedManifest = {
    path: '.mnemom/agents/role-x.yaml',
    resource: 'alignment',
    scope: 'agent',
    scope_id: 'role-x',
    raw_yaml: '',
  };
  return { source, parsed };
}

function protectionManifest(parsed: Record<string, unknown>): ParsedManifest {
  const source: ChangedManifest = {
    path: '.mnemom/protection/role-x.yaml',
    resource: 'protection',
    scope: 'agent',
    scope_id: 'role-x',
    raw_yaml: '',
  };
  return { source, parsed };
}

describe('projectManifest', () => {
  it('maps alignment modes to top-level fields', () => {
    const projected = projectManifest('alignment', {
      role_id: 'role-x',
      modes: { autonomy: 'observe', integrity: 'nudge' },
    });
    expect(projected['autonomy_mode']).toBe('observe');
    expect(projected['integrity_mode']).toBe('nudge');
  });

  it('omits modes that are not present', () => {
    const projected = projectManifest('alignment', { role_id: 'role-x' });
    expect('autonomy_mode' in projected).toBe(false);
  });

  it('maps protection fields directly', () => {
    const projected = projectManifest('protection', {
      role_id: 'role-x',
      mode: 'observe',
      thresholds: { warn: 0.5, quarantine: 0.7, block: 0.9 },
    });
    expect(projected['mode']).toBe('observe');
    expect(projected['thresholds']).toEqual({ warn: 0.5, quarantine: 0.7, block: 0.9 });
  });

  it('drops invalid mode values', () => {
    const projected = projectManifest('alignment', {
      modes: { autonomy: 'super-extreme' },
    });
    expect('autonomy_mode' in projected).toBe(false);
  });
});

describe('buildComposeDiff', () => {
  it('emits a care-framed advisory when manifest would relax autonomy mode', () => {
    const parsed = alignmentManifest({
      role_id: 'role-x',
      modes: { autonomy: 'observe' },
    });
    const effective: EffectiveResponse = { autonomy_mode: 'nudge' };
    const diff = buildComposeDiff(parsed, effective);
    expect(diff.advisories.length).toBe(1);
    expect(diff.advisories[0]).toContain('autonomy_mode');
    expect(diff.advisories[0]).toContain('would benefit from');
  });

  it('emits no advisory when manifest tightens', () => {
    const parsed = alignmentManifest({
      role_id: 'role-x',
      modes: { autonomy: 'enforce' },
    });
    const effective: EffectiveResponse = { autonomy_mode: 'observe' };
    const diff = buildComposeDiff(parsed, effective);
    expect(diff.advisories).toEqual([]);
  });

  it('builds sections for protection fields', () => {
    const parsed = protectionManifest({
      role_id: 'role-x',
      mode: 'observe',
      thresholds: { warn: 0.6, quarantine: 0.8, block: 0.95 },
    });
    const diff = buildComposeDiff(parsed, undefined);
    expect(diff.sections.length).toBeGreaterThanOrEqual(2);
    const modeSection = diff.sections.find((s) => s.heading === 'mode');
    expect(modeSection?.proposed).toBe('observe');
  });

  it('handles missing effective view gracefully', () => {
    const parsed = alignmentManifest({
      role_id: 'role-x',
      modes: { autonomy: 'observe' },
    });
    const diff = buildComposeDiff(parsed, undefined);
    expect(diff.sections.length).toBeGreaterThanOrEqual(1);
    expect(diff.advisories).toEqual([]);
  });

  it('emits protection mode advisory when proposed loosens', () => {
    const parsed = protectionManifest({
      role_id: 'role-x',
      mode: 'observe',
    });
    const effective: EffectiveResponse = { mode: 'enforce' };
    const diff = buildComposeDiff(parsed, effective);
    expect(diff.advisories.length).toBe(1);
  });
});
