import * as core from '@actions/core';
import * as path from 'node:path';
import { loadChangedManifests } from './detect.js';
import { isParseError, parseManifest } from './manifest.js';
import { loadCiConfig } from './ci-config.js';
import { loadSimulateCases, selectCasesForManifest } from './simulate-cases.js';
import { MnemomApiClient } from './api-client.js';
import { buildComposeDiff } from './compose-diff.js';
import { renderPrComment, renderParseErrorComment } from './render.js';
import {
  listChangedFiles,
  readPullRequestContext,
  upsertStickyComment,
} from './github.js';
import type {
  CardResource,
  CiConfig,
  ExplainResponse,
  PerManifestResult,
  SimulateCase,
  SimulateResponse,
} from './types.js';

interface ResolvedInputs {
  apiKey: string;
  apiBaseUrl: string;
  configPath: string;
  simulateCasesPath: string;
  githubToken: string;
  workspace: string;
}

function readInputs(): ResolvedInputs {
  const apiKey = core.getInput('api-key', { required: true }).trim(); // care-framing:rule-slug (actions/core option name)
  const apiBaseUrl = core.getInput('api-base-url').trim() || 'https://api.mnemom.ai';
  const configPath = core.getInput('config-path').trim() || '.mnemom/ci-config.yaml';
  const simulateCasesPath =
    core.getInput('simulate-cases-path').trim() || '.mnemom/tests/simulate-cases.yaml';
  const githubToken = core.getInput('github-token').trim();
  const workspace = process.env['GITHUB_WORKSPACE'] ?? process.cwd();
  if (!githubToken) {
    throw new Error('A GitHub token would benefit from being provided via the `github-token` input.');
  }
  return { apiKey, apiBaseUrl, configPath, simulateCasesPath, githubToken, workspace };
}

async function runSimulate(
  client: MnemomApiClient,
  resource: CardResource,
  agentId: string,
  c: SimulateCase,
): Promise<{ case: SimulateCase; response?: SimulateResponse; error?: string }> {
  try {
    const response = await client.simulate(resource, agentId, {
      candidate_input: c.candidate_input,
      candidate_tool_call: c.candidate_tool_call,
    });
    return { case: c, response };
  } catch (err) {
    return { case: c, error: (err as Error).message };
  }
}

const FAILURE_ORDER: Readonly<Record<'pass' | 'soft_warn' | 'hard_fail', number>> = {
  pass: 0,
  soft_warn: 1,
  hard_fail: 2,
};

type FailureLevel = 'pass' | 'soft_warn' | 'hard_fail';

function applyFailureMode(
  results: ReadonlyArray<PerManifestResult>,
  config: CiConfig,
  hadActionError: boolean,
): void {
  // Wrap in an object so TS doesn't narrow the assignment through the closure.
  const state: { highest: FailureLevel } = { highest: 'pass' };
  const escalate = (target: FailureLevel): void => {
    if (FAILURE_ORDER[target] > FAILURE_ORDER[state.highest]) {
      state.highest = target;
    }
  };

  if (hadActionError) escalate(config.behavior.on_action_error);

  for (const r of results) {
    if (!r.simulate) continue;
    for (const s of r.simulate) {
      if (!s.response) continue;
      switch (s.response.allowed) {
        case 'false':
          escalate(config.behavior.on_allowed_false);
          break;
        case 'conditional':
          escalate(config.behavior.on_allowed_conditional);
          break;
        case 'true':
          escalate(config.behavior.on_allowed_true);
          break;
      }
    }
  }

  if (state.highest === 'hard_fail') {
    core.setFailed('Mnemom Cards action surfaced a verdict that would benefit from review before merge.');
  } else if (state.highest === 'soft_warn') {
    core.warning('Mnemom Cards action surfaced a conditional verdict; review the PR comment.');
  }
}

export async function run(): Promise<void> {
  let inputs: ResolvedInputs;
  try {
    inputs = readInputs();
  } catch (err) {
    core.setFailed((err as Error).message);
    return;
  }

  const prCtx = readPullRequestContext();
  if (!prCtx) {
    core.info('No pull-request context — Mnemom Cards skipped.');
    return;
  }

  let hadActionError = false;
  let config: CiConfig;
  try {
    config = await loadCiConfig(path.join(inputs.workspace, inputs.configPath));
  } catch (err) {
    core.warning(`CI config load: ${(err as Error).message}`);
    config = (await loadCiConfig('/dev/null'));
  }

  let changedPaths: string[];
  try {
    changedPaths = await listChangedFiles(inputs.githubToken, prCtx);
  } catch (err) {
    core.warning(`Listing PR files: ${(err as Error).message}`);
    changedPaths = [];
    hadActionError = true;
  }

  const manifests = await loadChangedManifests(inputs.workspace, changedPaths);
  if (manifests.length === 0) {
    core.info('No `.mnemom/<scope>/**.yaml` files in this PR. Mnemom Cards has nothing to render.');
    return;
  }

  const simulateCases = await loadSimulateCases(
    path.join(inputs.workspace, inputs.simulateCasesPath),
  );

  const client = new MnemomApiClient({
    apiKey: inputs.apiKey,
    baseUrl: inputs.apiBaseUrl,
  });

  const parseErrors: string[] = [];
  const renderInputs: Array<{ result: PerManifestResult; diff: ReturnType<typeof buildComposeDiff> }> = [];

  for (const manifest of manifests) {
    const parsed = parseManifest(manifest);
    if (isParseError(parsed)) {
      parseErrors.push(`\`${manifest.path}\` — ${parsed.message}`);
      continue;
    }

    let effective;
    let effectiveError: string | undefined;
    if (manifest.scope === 'agent') {
      try {
        effective = await client.getEffective(manifest.resource, manifest.scope_id);
      } catch (err) {
        effectiveError = (err as Error).message;
        hadActionError = true;
      }
    } else {
      effectiveError = `The /effective endpoint depends on agent scope; ${manifest.scope}-scope preview would benefit from a follow-on phase.`;
    }

    const diff = buildComposeDiff(parsed, effective);

    const simulateResults: Array<{
      case: SimulateCase;
      response?: SimulateResponse;
      error?: string;
    }> = [];
    if (manifest.scope === 'agent' && manifest.resource === 'alignment') {
      const cases = selectCasesForManifest(simulateCases, manifest.resource, manifest.scope_id);
      for (const c of cases) {
        const sim = await runSimulate(client, manifest.resource, manifest.scope_id, c);
        if (sim.error) hadActionError = true;
        simulateResults.push(sim);
      }
    }

    let explain: ExplainResponse | undefined;
    let explainError: string | undefined;
    if (manifest.scope === 'agent' && manifest.resource === 'alignment') {
      try {
        explain = await client.explain(manifest.resource, manifest.scope_id, { enrich: false });
      } catch (err) {
        explainError = (err as Error).message;
        hadActionError = true;
      }
    }

    const result: PerManifestResult = {
      manifest,
      effective,
      effective_error: effectiveError,
      proposed_summary: diff.proposed_summary,
      advisories: diff.advisories,
      simulate: simulateResults,
      explain,
      explain_error: explainError,
    };
    renderInputs.push({ result, diff });
  }

  let body: string;
  if (renderInputs.length === 0 && parseErrors.length > 0) {
    body = renderParseErrorComment(parseErrors);
  } else {
    body = renderPrComment({
      results: renderInputs,
      headSha: prCtx.head_sha,
      apiBaseUrl: inputs.apiBaseUrl,
    });
    if (parseErrors.length > 0) {
      body += '\n\n---\n\n**Parse-error follow-ups**\n\n' + parseErrors.map((e) => `- ${e}`).join('\n');
    }
  }

  try {
    const url = await upsertStickyComment(inputs.githubToken, prCtx, body);
    core.info(`Posted sticky comment: ${url}`);
  } catch (err) {
    core.warning(`Posting comment: ${(err as Error).message}`);
    hadActionError = true;
  }

  applyFailureMode(
    renderInputs.map((r) => r.result),
    config,
    hadActionError,
  );
}

run().catch((err) => {
  core.setFailed((err as Error).message);
});
