import type { AlignmentMode, CardResource, EffectiveResponse } from './types.js';
import type { ParsedManifest } from './manifest.js';

const MODE_RANK: Readonly<Record<AlignmentMode, number>> = Object.freeze({
  off: 0,
  observe: 1,
  nudge: 2,
  enforce: 3,
});

function asMode(value: unknown): AlignmentMode | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'off' || value === 'observe' || value === 'nudge' || value === 'enforce') {
    return value;
  }
  return undefined;
}

export interface ComposeDiffSection {
  readonly heading: string;
  readonly current: unknown;
  readonly proposed: unknown;
  readonly advisory?: string;
}

export interface ComposeDiff {
  readonly resource: CardResource;
  readonly sections: ReadonlyArray<ComposeDiffSection>;
  readonly advisories: ReadonlyArray<string>;
  readonly proposed_summary: Record<string, unknown>;
}

/**
 * Project a parsed alignment manifest into the canonical field-set the
 * effective view uses. Sparse — fields the manifest doesn't touch are
 * omitted from the projection, signalling "inherit from cascade."
 */
function projectAlignmentManifest(parsed: Record<string, unknown>): Record<string, unknown> {
  const projection: Record<string, unknown> = {};
  if ('role_id' in parsed) projection['role_id'] = parsed['role_id'];
  if ('agent_id' in parsed) projection['agent_id'] = parsed['agent_id'];

  const modes = parsed['modes'];
  if (modes && typeof modes === 'object' && !Array.isArray(modes)) {
    const m = modes as Record<string, unknown>;
    if (asMode(m['autonomy'])) projection['autonomy_mode'] = m['autonomy'];
    if (asMode(m['integrity'])) projection['integrity_mode'] = m['integrity'];
  }
  if (parsed['principal']) projection['principal'] = parsed['principal'];
  if (Array.isArray(parsed['values'])) projection['values_declared'] = parsed['values'];
  if (Array.isArray(parsed['connectors'])) projection['connectors'] = parsed['connectors'];
  if (parsed['team_templates']) projection['team_templates'] = parsed['team_templates'];
  return projection;
}

function projectProtectionManifest(parsed: Record<string, unknown>): Record<string, unknown> {
  const projection: Record<string, unknown> = {};
  if ('role_id' in parsed) projection['role_id'] = parsed['role_id'];
  if ('agent_id' in parsed) projection['agent_id'] = parsed['agent_id'];
  if (asMode(parsed['mode'])) projection['mode'] = parsed['mode'];
  if (parsed['thresholds']) projection['thresholds'] = parsed['thresholds'];
  if (parsed['screen_surfaces']) projection['screen_surfaces'] = parsed['screen_surfaces'];
  if (parsed['trusted_sources']) projection['trusted_sources'] = parsed['trusted_sources'];
  return projection;
}

/**
 * Project a manifest into the canonical-shape projection used for the diff.
 */
export function projectManifest(
  resource: CardResource,
  parsed: Record<string, unknown>,
): Record<string, unknown> {
  return resource === 'alignment'
    ? projectAlignmentManifest(parsed)
    : projectProtectionManifest(parsed);
}

/**
 * Detect monotone-tightening advisories: the action surfaces a care-framed
 * advisory when a manifest's declared mode would relax the current
 * effective mode. The platform PUT-time check is authoritative; this is
 * editorial-feedback.
 */
function modeMonotoneAdvisory(
  field: string,
  proposed: AlignmentMode | undefined,
  current: AlignmentMode | undefined,
): string | undefined {
  if (!proposed || !current) return undefined;
  const proposedRank = MODE_RANK[proposed];
  const currentRank = MODE_RANK[current];
  if (proposedRank < currentRank) {
    return `Proposed \`${field}\` is \`${proposed}\` and the agent's current effective \`${field}\` is \`${current}\`. The platform's monotone-tightening check would benefit from observing this at publish time; the cascade ordering depends on agent values nesting under org / team / platform overlays.`;
  }
  return undefined;
}

/**
 * Build a diff between a parsed manifest and the agent's current effective
 * canonical view. Surfaces a small set of "would loosen" advisories as
 * care-framed prose.
 */
export function buildComposeDiff(
  parsed: ParsedManifest,
  effective: EffectiveResponse | undefined,
): ComposeDiff {
  const resource = parsed.source.resource;
  const proposed = projectManifest(resource, parsed.parsed);
  const sections: ComposeDiffSection[] = [];
  const advisories: string[] = [];

  if (resource === 'alignment') {
    const autonomyAdvisory = modeMonotoneAdvisory(
      'autonomy_mode',
      proposed['autonomy_mode'] as AlignmentMode | undefined,
      effective?.autonomy_mode,
    );
    if (autonomyAdvisory) advisories.push(autonomyAdvisory);
    const integrityAdvisory = modeMonotoneAdvisory(
      'integrity_mode',
      proposed['integrity_mode'] as AlignmentMode | undefined,
      effective?.integrity_mode,
    );
    if (integrityAdvisory) advisories.push(integrityAdvisory);

    for (const key of ['autonomy_mode', 'integrity_mode', 'principal', 'values_declared']) {
      if (key in proposed) {
        sections.push({
          heading: key,
          current: effective?.[key === 'values_declared' ? 'values' : key],
          proposed: proposed[key],
        });
      }
    }
  } else {
    const modeAdvisory = modeMonotoneAdvisory(
      'mode',
      proposed['mode'] as AlignmentMode | undefined,
      effective?.mode,
    );
    if (modeAdvisory) advisories.push(modeAdvisory);

    for (const key of ['mode', 'thresholds', 'screen_surfaces', 'trusted_sources']) {
      if (key in proposed) {
        sections.push({
          heading: key,
          current: effective?.[key],
          proposed: proposed[key],
        });
      }
    }
  }

  return {
    resource,
    sections,
    advisories,
    proposed_summary: proposed,
  };
}

