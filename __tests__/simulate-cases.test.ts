import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadSimulateCases, selectCasesForManifest } from '../src/simulate-cases.js';

describe('loadSimulateCases', () => {
  it('returns empty when file is absent', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-action-sim-'));
    try {
      const cases = await loadSimulateCases(path.join(dir, 'missing.yaml'));
      expect(cases).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('parses valid cases', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-action-sim-'));
    try {
      const p = path.join(dir, 'sim.yaml');
      await fs.writeFile(
        p,
        `cases:
  - agent_id: smolt-x
    resource: alignment
    description: "Test 1"
    candidate_tool_call:
      tool_name: send_msg
      tool_args:
        channel: general
  - agent_id: smolt-y
    resource: protection
    description: "Test 2"
`,
        'utf8',
      );
      const cases = await loadSimulateCases(p);
      expect(cases.length).toBe(2);
      expect(cases[0]?.candidate_tool_call?.tool_name).toBe('send_msg');
      expect(cases[1]?.resource).toBe('protection');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('skips entries with invalid resource', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-action-sim-'));
    try {
      const p = path.join(dir, 'sim.yaml');
      await fs.writeFile(
        p,
        `cases:
  - agent_id: smolt-x
    resource: not-real
    description: "Test"
`,
        'utf8',
      );
      const cases = await loadSimulateCases(p);
      expect(cases).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('selectCasesForManifest', () => {
  it('filters cases to a matching agent_id and resource', () => {
    const all = [
      { agent_id: 'a', resource: 'alignment' as const, description: '1' },
      { agent_id: 'b', resource: 'alignment' as const, description: '2' },
      { agent_id: 'a', resource: 'protection' as const, description: '3' },
    ];
    const selected = selectCasesForManifest(all, 'alignment', 'a');
    expect(selected.length).toBe(1);
    expect(selected[0]?.description).toBe('1');
  });
});
