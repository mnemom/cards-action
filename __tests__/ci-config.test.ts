import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadCiConfig } from '../src/ci-config.js';

describe('loadCiConfig', () => {
  it('returns defaults when file is absent', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-action-ci-'));
    try {
      const cfg = await loadCiConfig(path.join(dir, 'missing.yaml'));
      expect(cfg.behavior.on_allowed_false).toBe('hard_fail');
      expect(cfg.behavior.on_allowed_conditional).toBe('soft_warn');
      expect(cfg.behavior.on_allowed_true).toBe('pass');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('respects valid overrides', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-action-ci-'));
    try {
      const p = path.join(dir, 'ci.yaml');
      await fs.writeFile(
        p,
        'behavior:\n  on_allowed_false: soft_warn\n  on_allowed_true: pass\n',
        'utf8',
      );
      const cfg = await loadCiConfig(p);
      expect(cfg.behavior.on_allowed_false).toBe('soft_warn');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('falls back to defaults on unrecognised values', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-action-ci-'));
    try {
      const p = path.join(dir, 'ci.yaml');
      await fs.writeFile(p, 'behavior:\n  on_allowed_false: weird_mode\n', 'utf8');
      const cfg = await loadCiConfig(p);
      expect(cfg.behavior.on_allowed_false).toBe('hard_fail');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('falls back to defaults on malformed YAML', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cards-action-ci-'));
    try {
      const p = path.join(dir, 'ci.yaml');
      await fs.writeFile(p, 'behavior: [unclosed', 'utf8');
      const cfg = await loadCiConfig(p);
      expect(cfg.behavior.on_allowed_false).toBe('hard_fail');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
