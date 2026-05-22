import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { classifyManifestPath, loadChangedManifests } from '../src/detect.js';

describe('classifyManifestPath', () => {
  it('classifies an agent alignment manifest', () => {
    expect(classifyManifestPath('.mnemom/agents/role-ai-cfo-v1.yaml')).toEqual({
      resource: 'alignment',
      scope: 'agent',
      scope_id: 'role-ai-cfo-v1',
    });
  });

  it('classifies an agent protection manifest', () => {
    expect(classifyManifestPath('.mnemom/protection/role-ai-cfo-v1.yaml')).toEqual({
      resource: 'protection',
      scope: 'agent',
      scope_id: 'role-ai-cfo-v1',
    });
  });

  it('classifies an org alignment manifest', () => {
    expect(classifyManifestPath('.mnemom/orgs/polis-mnemom-v1/alignment.yaml')).toEqual({
      resource: 'alignment',
      scope: 'org',
      scope_id: 'polis-mnemom-v1',
    });
  });

  it('classifies a team protection manifest', () => {
    expect(classifyManifestPath('.mnemom/teams/team-finance/protection.yml')).toEqual({
      resource: 'protection',
      scope: 'team',
      scope_id: 'team-finance',
    });
  });

  it('classifies a platform manifest', () => {
    expect(classifyManifestPath('.mnemom/platform/default.yaml')).toEqual({
      resource: 'alignment',
      scope: 'platform',
      scope_id: 'default',
    });
  });

  it('returns null for unrelated paths', () => {
    expect(classifyManifestPath('packages/core/src/file.py')).toBeNull();
    expect(classifyManifestPath('.mnemom/config.yaml')).toBeNull();
    expect(classifyManifestPath('.mnemom/orgs/just-name.yaml')).toBeNull();
  });
});

describe('loadChangedManifests', () => {
  it('reads manifest bodies from disk and skips non-manifest paths', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-action-detect-'));
    try {
      await fs.mkdir(path.join(dir, '.mnemom', 'agents'), { recursive: true });
      const manifestPath = path.join(dir, '.mnemom', 'agents', 'role-x.yaml');
      await fs.writeFile(manifestPath, 'role_id: role-x\nagent_id: smolt-x\n', 'utf8');
      const results = await loadChangedManifests(dir, [
        '.mnemom/agents/role-x.yaml',
        'README.md',
      ]);
      expect(results).toHaveLength(1);
      expect(results[0]?.raw_yaml).toContain('role-x');
      expect(results[0]?.resource).toBe('alignment');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('returns empty list when no manifest paths', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-action-detect-'));
    try {
      const results = await loadChangedManifests(dir, ['README.md', 'src/file.ts']);
      expect(results).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
