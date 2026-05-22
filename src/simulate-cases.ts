import * as fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import type { SimulateCase, CardResource } from './types.js';

const VALID_RESOURCES: ReadonlySet<CardResource> = new Set(['alignment', 'protection']);

/**
 * Read `.mnemom/tests/simulate-cases.yaml`. Returns empty array if the
 * file is absent or malformed — the action proceeds with no simulate
 * cases rather than failing.
 */
export async function loadSimulateCases(absPath: string): Promise<SimulateCase[]> {
  let raw: string;
  try {
    raw = await fs.readFile(absPath, 'utf8');
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw, { schema: yaml.FAILSAFE_SCHEMA });
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }
  const cases = (parsed as Record<string, unknown>)['cases'];
  if (!Array.isArray(cases)) return [];

  const out: SimulateCase[] = [];
  for (const entry of cases) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const agent_id = e['agent_id'];
    const resource = e['resource'];
    const description = e['description'];
    if (typeof agent_id !== 'string') continue;
    if (typeof resource !== 'string' || !VALID_RESOURCES.has(resource as CardResource)) continue;
    if (typeof description !== 'string') continue;

    let candidate_input: SimulateCase['candidate_input'];
    if (e['candidate_input'] && typeof e['candidate_input'] === 'object') {
      const ci = e['candidate_input'] as Record<string, unknown>;
      if (Array.isArray(ci['messages'])) {
        const messages: Array<{ role: string; content: string }> = [];
        for (const msg of ci['messages']) {
          if (msg && typeof msg === 'object') {
            const m = msg as Record<string, unknown>;
            if (typeof m['role'] === 'string' && typeof m['content'] === 'string') {
              messages.push({ role: m['role'], content: m['content'] });
            }
          }
        }
        candidate_input = { messages };
      }
    }

    let candidate_tool_call: SimulateCase['candidate_tool_call'];
    if (e['candidate_tool_call'] && typeof e['candidate_tool_call'] === 'object') {
      const ctc = e['candidate_tool_call'] as Record<string, unknown>;
      const tool_name = typeof ctc['tool_name'] === 'string' ? ctc['tool_name'] : undefined;
      const tool_args =
        ctc['tool_args'] && typeof ctc['tool_args'] === 'object' && !Array.isArray(ctc['tool_args'])
          ? (ctc['tool_args'] as Record<string, unknown>)
          : undefined;
      candidate_tool_call = { tool_name, tool_args };
    }

    out.push({
      agent_id,
      resource: resource as CardResource,
      description,
      candidate_input,
      candidate_tool_call,
    });
  }
  return out;
}

/**
 * Filter simulate cases that apply to a given (resource, scope_id). The
 * action only runs cases whose `agent_id` matches the manifest under
 * review.
 */
export function selectCasesForManifest(
  cases: ReadonlyArray<SimulateCase>,
  resource: CardResource,
  agentId: string,
): SimulateCase[] {
  return cases.filter((c) => c.resource === resource && c.agent_id === agentId);
}
