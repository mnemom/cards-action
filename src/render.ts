import * as yaml from 'js-yaml';
import type {
  PerManifestResult,
  SimulateResponse,
  SimulateAllowed,
  ExplainRemediation,
} from './types.js';
import type { ComposeDiff } from './compose-diff.js';
import { assertCareFramed } from './care-framing.js';

export const STICKY_COMMENT_MARKER = '<!-- mnemom-cards-action -->';

const ALLOWED_SYMBOL: Readonly<Record<SimulateAllowed, string>> = {
  true: '✅',
  false: '🔶',
  conditional: '🟡',
};

const ALLOWED_LABEL: Readonly<Record<SimulateAllowed, string>> = {
  true: 'allowed',
  false: 'would benefit from review',
  conditional: 'conditional',
};

function yamlBlock(value: unknown): string {
  if (value === undefined || value === null) {
    return '_no current value — would inherit from cascade_';
  }
  const dumped = yaml.dump(value, { indent: 2, lineWidth: 100, noRefs: true });
  return '```yaml\n' + dumped.trimEnd() + '\n```';
}

function renderDiffSection(section: ComposeDiff['sections'][number]): string {
  const heading = `**${section.heading}**`;
  const currentBlock = yamlBlock(section.current);
  const proposedBlock = yamlBlock(section.proposed);
  return [
    heading,
    '',
    '_current effective:_',
    currentBlock,
    '',
    '_proposed:_',
    proposedBlock,
  ].join('\n');
}

function renderSimulateLine(s: {
  case: { description: string; candidate_tool_call?: { tool_name?: string } };
  response?: SimulateResponse;
  error?: string;
}): string {
  if (s.error) {
    return `- ⚠️ ${s.case.description} — simulate error: ${s.error}`;
  }
  const r = s.response!;
  const symbol = ALLOWED_SYMBOL[r.allowed];
  const label = ALLOWED_LABEL[r.allowed];
  const tool = s.case.candidate_tool_call?.tool_name ?? '(no tool)';
  const conditions = r.conditions.length > 0 ? ` — conditions: ${r.conditions.join('; ')}` : '';
  return `- ${symbol} \`${tool}\` — ${s.case.description}: ${label}${conditions}`;
}

function renderRemediation(r: ExplainRemediation): string {
  const target = r.method && r.url ? ` (\`${r.method} ${r.url}\`)` : '';
  return `- ${r.remediation}${target}`;
}

function renderPerManifest(result: PerManifestResult, diff: ComposeDiff): string {
  const lines: string[] = [];
  const scopeHeader = `### \`${result.manifest.path}\` — ${result.manifest.resource} / ${result.manifest.scope}`;
  lines.push(scopeHeader, '');

  if (result.effective_error) {
    lines.push(`_The agent's current effective view could not be fetched: ${result.effective_error}. The action depends on a reachable Mnemom API to render a full diff._`);
    lines.push('');
  }

  if (diff.sections.length > 0) {
    lines.push('**Composed view diff**', '');
    for (const section of diff.sections) {
      lines.push(renderDiffSection(section), '');
    }
  } else {
    lines.push('_No field-level overlay surfaced from this manifest. The platform composes against the cascade at publish time._', '');
  }

  if (diff.advisories.length > 0) {
    lines.push('**Care-framed advisories**', '');
    for (const a of diff.advisories) {
      lines.push(`- ${a}`);
    }
    lines.push('');
  }

  if (result.simulate && result.simulate.length > 0) {
    lines.push('**Simulate (golden-path tool calls)**', '');
    for (const s of result.simulate) {
      lines.push(renderSimulateLine(s));
    }
    lines.push('');
  }

  if (result.explain_error) {
    lines.push(`_Explain trace would benefit from a reachable Mnemom API. Skipped: ${result.explain_error}._`, '');
  } else if (result.explain) {
    const verdict = result.explain.trace?.verdict ?? '—';
    lines.push('**Explain (current canonical)**', '', `Verdict: \`${verdict}\``, '');
    if (result.explain.reasoning) {
      lines.push('> ' + result.explain.reasoning.split('\n').join('\n> '), '');
    }
    if (result.explain.suggested_remediations.length > 0) {
      lines.push('Remediations:', '');
      for (const r of result.explain.suggested_remediations) {
        lines.push(renderRemediation(r));
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export interface RenderOptions {
  readonly results: ReadonlyArray<{ result: PerManifestResult; diff: ComposeDiff }>;
  readonly headSha?: string;
  readonly apiBaseUrl: string;
}

/**
 * Render the full PR comment body. Always begins with the sticky marker
 * so subsequent runs can find + update this comment instead of stacking.
 */
export function renderPrComment(opts: RenderOptions): string {
  const intro = [
    STICKY_COMMENT_MARKER,
    '## Mnemom Cards — editorial feedback',
    '',
    `This PR changes **${opts.results.length} manifest file${opts.results.length === 1 ? '' : 's'}**.`,
    '',
    `Each section below shows the proposed canonical-shape overlay diff against the agent's current effective state, any care-framed advisories from the local monotone-tightening check, simulate results for golden-path tool calls, and the explain trace from the policy engine. The action is read-only — the merge does not auto-publish; an operator runs \`publish_manifest\` to update the canonical card.`,
    '',
    '---',
    '',
  ];
  const sections: string[] = [];
  for (const r of opts.results) {
    sections.push(renderPerManifest(r.result, r.diff));
  }
  const footer = [
    '',
    '---',
    '',
    `*Posted by [mnemom/cards-action@v1](https://github.com/mnemom/cards-action). API base: \`${opts.apiBaseUrl}\`.${opts.headSha ? ` Head SHA: \`${opts.headSha.slice(0, 7)}\`.` : ''}*`,
  ];
  const body = [...intro, ...sections, ...footer].join('\n');
  assertCareFramed(body, 'rendered PR comment');
  return body;
}

/**
 * Body for the degraded case where the action could not load the
 * manifest at all (YAML parse failed). Still care-framed.
 */
export function renderParseErrorComment(messages: ReadonlyArray<string>): string {
  const body = [
    STICKY_COMMENT_MARKER,
    '## Mnemom Cards — editorial feedback',
    '',
    'The manifest YAML on this PR would benefit from a small follow-up. Each entry below names the file and the issue.',
    '',
    ...messages.map((m) => `- ${m}`),
    '',
    '_Update the file and push again; the action will re-render this comment._',
  ].join('\n');
  assertCareFramed(body, 'parse-error PR comment');
  return body;
}
