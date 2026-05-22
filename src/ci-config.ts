import * as fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import type { CiConfig, FailureBehavior } from './types.js';

const DEFAULT: CiConfig = {
  behavior: {
    on_allowed_false: 'hard_fail',
    on_allowed_conditional: 'soft_warn',
    on_allowed_true: 'pass',
    on_action_error: 'soft_warn',
  },
};

const ALLOWED_BEHAVIORS: ReadonlySet<FailureBehavior> = new Set([
  'hard_fail',
  'soft_warn',
  'pass',
]);

function coerceBehavior(value: unknown, fallback: FailureBehavior): FailureBehavior {
  if (typeof value === 'string' && (ALLOWED_BEHAVIORS as Set<string>).has(value)) {
    return value as FailureBehavior;
  }
  return fallback;
}

/**
 * Read `.mnemom/ci-config.yaml`. Defaults apply when the file is absent
 * or fields are missing. Unrecognised behaviour strings fall back to
 * defaults rather than throwing — the action stays useful even when the
 * config has drift.
 */
export async function loadCiConfig(absPath: string): Promise<CiConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(absPath, 'utf8');
  } catch {
    return DEFAULT;
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw, { schema: yaml.FAILSAFE_SCHEMA });
  } catch {
    return DEFAULT;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return DEFAULT;
  }
  const behavior = (parsed as Record<string, unknown>)['behavior'];
  if (!behavior || typeof behavior !== 'object' || Array.isArray(behavior)) {
    return DEFAULT;
  }
  const b = behavior as Record<string, unknown>;
  return {
    behavior: {
      on_allowed_false: coerceBehavior(b['on_allowed_false'], DEFAULT.behavior.on_allowed_false),
      on_allowed_conditional: coerceBehavior(
        b['on_allowed_conditional'],
        DEFAULT.behavior.on_allowed_conditional,
      ),
      on_allowed_true: coerceBehavior(b['on_allowed_true'], DEFAULT.behavior.on_allowed_true),
      on_action_error: coerceBehavior(b['on_action_error'], DEFAULT.behavior.on_action_error),
    },
  };
}

export { DEFAULT as DEFAULT_CI_CONFIG };
