import * as yaml from 'js-yaml';
import type { ChangedManifest } from './types.js';

export interface ParsedManifest {
  readonly source: ChangedManifest;
  readonly parsed: Record<string, unknown>;
}

export interface ManifestParseError {
  readonly source: ChangedManifest;
  readonly message: string;
}

/**
 * Parse a manifest's YAML body with the FAILSAFE_SCHEMA — no merge keys,
 * no anchors, no arbitrary tag resolution. Defensive against YAML bombs.
 */
export function parseManifest(
  manifest: ChangedManifest,
): ParsedManifest | ManifestParseError {
  let raw: unknown;
  try {
    raw = yaml.load(manifest.raw_yaml, { schema: yaml.FAILSAFE_SCHEMA });
  } catch (err) {
    return {
      source: manifest,
      message: `YAML parse: ${(err as Error).message}`,
    };
  }
  if (raw === null || raw === undefined) {
    return {
      source: manifest,
      message: 'Manifest is empty.',
    };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      source: manifest,
      message: 'Manifest top-level shape would benefit from being a mapping.',
    };
  }
  return {
    source: manifest,
    parsed: raw as Record<string, unknown>,
  };
}

export function isParseError(
  value: ParsedManifest | ManifestParseError,
): value is ManifestParseError {
  return 'message' in value;
}
