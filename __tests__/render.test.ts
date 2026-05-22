import { describe, it, expect } from 'vitest';
import {
  renderPrComment,
  renderParseErrorComment,
  STICKY_COMMENT_MARKER,
} from '../src/render.js';
import { buildComposeDiff } from '../src/compose-diff.js';
import type { ChangedManifest, PerManifestResult } from '../src/types.js';
import type { ParsedManifest } from '../src/manifest.js';

function makeResult(): { result: PerManifestResult; diff: ReturnType<typeof buildComposeDiff> } {
  const manifest: ChangedManifest = {
    path: '.mnemom/agents/role-x.yaml',
    resource: 'alignment',
    scope: 'agent',
    scope_id: 'smolt-x',
    raw_yaml: '',
  };
  const parsed: ParsedManifest = {
    source: manifest,
    parsed: {
      role_id: 'role-x',
      modes: { autonomy: 'observe' },
    },
  };
  const diff = buildComposeDiff(parsed, { autonomy_mode: 'observe' });
  const result: PerManifestResult = {
    manifest,
    effective: { autonomy_mode: 'observe' },
    proposed_summary: diff.proposed_summary,
    advisories: diff.advisories,
    simulate: [
      {
        case: {
          agent_id: 'smolt-x',
          resource: 'alignment',
          description: 'test case 1',
          candidate_tool_call: { tool_name: 'send_msg' },
        },
        response: {
          ok: true,
          resource: 'alignment',
          allowed: 'true',
          conditions: [],
          suggestions: [],
        },
      },
    ],
    explain: {
      ok: true,
      resource: 'alignment',
      reasoning: 'composes cleanly',
      suggested_remediations: [],
      trace: { verdict: 'pass' },
    },
  };
  return { result, diff };
}

describe('renderPrComment', () => {
  it('begins with the sticky marker', () => {
    const body = renderPrComment({
      results: [makeResult()],
      apiBaseUrl: 'https://api.mnemom.ai',
    });
    expect(body.startsWith(STICKY_COMMENT_MARKER)).toBe(true);
  });

  it('includes the simulate verdict symbol', () => {
    const body = renderPrComment({
      results: [makeResult()],
      apiBaseUrl: 'https://api.mnemom.ai',
    });
    expect(body).toContain('✅');
    expect(body).toContain('send_msg');
  });

  it('mentions the api base url in the footer', () => {
    const body = renderPrComment({
      results: [makeResult()],
      apiBaseUrl: 'https://staging.mnemom.ai',
    });
    expect(body).toContain('staging.mnemom.ai');
  });

  it('does not contain any care-framing-substitution candidates', () => {
    const body = renderPrComment({
      results: [makeResult()],
      apiBaseUrl: 'https://api.mnemom.ai',
    });
    // Forbidden literals would have thrown via assertCareFramed.
    expect(body.length).toBeGreaterThan(0);
  });
});

describe('renderParseErrorComment', () => {
  it('returns a care-framed parse-error body', () => {
    const body = renderParseErrorComment(['file-x — YAML parse: unexpected token']);
    expect(body.startsWith(STICKY_COMMENT_MARKER)).toBe(true);
    expect(body).toContain('YAML parse');
  });
});
