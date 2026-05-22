import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ChangedManifest, CardResource, CardScope } from './types.js';

const MANIFEST_PATTERN =
  /^\.mnemom\/(agents|protection|orgs|teams|platform)\/(.+?)\.ya?ml$/;

interface ParsedPath {
  resource: CardResource;
  scope: CardScope;
  scope_id: string;
}

/**
 * Classify a `.mnemom/...` manifest path into its (resource, scope, id)
 * triple. Returns null for paths outside the manifest tree or shapes the
 * action does not yet handle.
 */
export function classifyManifestPath(p: string): ParsedPath | null {
  const m = MANIFEST_PATTERN.exec(p);
  if (!m) return null;

  const folder = m[1]!;
  const tail = m[2]!;

  switch (folder) {
    case 'agents':
      return { resource: 'alignment', scope: 'agent', scope_id: tail };
    case 'protection':
      return { resource: 'protection', scope: 'agent', scope_id: tail };
    case 'platform':
      return { resource: 'alignment', scope: 'platform', scope_id: tail };
    case 'orgs': {
      const orgMatch = /^([^/]+)\/(alignment|protection)$/.exec(tail);
      if (!orgMatch) return null;
      const orgId = orgMatch[1]!;
      const resource = orgMatch[2] as CardResource;
      return { resource, scope: 'org', scope_id: orgId };
    }
    case 'teams': {
      const teamMatch = /^([^/]+)\/(alignment|protection)$/.exec(tail);
      if (!teamMatch) return null;
      const teamId = teamMatch[1]!;
      const resource = teamMatch[2] as CardResource;
      return { resource, scope: 'team', scope_id: teamId };
    }
    default:
      return null;
  }
}

/**
 * Read a manifest file from disk and return a ChangedManifest record.
 * Surfaces both the classified triple and the raw YAML text.
 */
export async function loadChangedManifest(
  repoRoot: string,
  relativePath: string,
): Promise<ChangedManifest | null> {
  const classified = classifyManifestPath(relativePath);
  if (!classified) return null;
  const abs = path.join(repoRoot, relativePath);
  let raw: string;
  try {
    raw = await fs.readFile(abs, 'utf8');
  } catch {
    return null;
  }
  return {
    path: relativePath,
    resource: classified.resource,
    scope: classified.scope,
    scope_id: classified.scope_id,
    raw_yaml: raw,
  };
}

/**
 * Load every changed manifest the caller has identified.
 *
 * Caller provides the path list (e.g. from the GitHub PR API or
 * `git diff --name-only`). This helper filters down to manifest paths,
 * classifies them, and reads their bodies.
 */
export async function loadChangedManifests(
  repoRoot: string,
  changedPaths: ReadonlyArray<string>,
): Promise<ChangedManifest[]> {
  const out: ChangedManifest[] = [];
  for (const rel of changedPaths) {
    const m = await loadChangedManifest(repoRoot, rel);
    if (m) out.push(m);
  }
  return out;
}
