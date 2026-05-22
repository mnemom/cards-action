/**
 * Public shape types shared across the action.
 *
 * These mirror the mnemom-api OpenAPI components for the endpoints the
 * action consumes. They are deliberately narrow — the action only reads
 * a small slice of each response.
 */

export type CardResource = 'alignment' | 'protection';

export type CardScope = 'platform' | 'org' | 'team' | 'agent';

export type AlignmentMode = 'off' | 'observe' | 'nudge' | 'enforce';

export interface ChangedManifest {
  readonly path: string;
  readonly resource: CardResource;
  readonly scope: CardScope;
  readonly scope_id: string;
  readonly raw_yaml: string;
}

export interface ProvenanceEntry {
  readonly layer: 'platform' | 'org' | 'team' | 'agent' | 'derived';
  readonly layer_id?: string;
  readonly kind?: string;
}

export type FieldProvenance = Readonly<Record<string, ProvenanceEntry>>;

export interface EffectiveResponse {
  readonly card_version?: string;
  readonly agent_id?: string;
  readonly autonomy_mode?: AlignmentMode;
  readonly integrity_mode?: AlignmentMode;
  readonly mode?: AlignmentMode;
  readonly _composition?: {
    readonly field_provenance?: FieldProvenance;
  };
  readonly [key: string]: unknown;
}

export interface SimulateRequest {
  readonly candidate_input?: {
    readonly messages?: Array<{ role: string; content: string }>;
  };
  readonly candidate_tool_call?: {
    readonly tool_name?: string;
    readonly tool_args?: Record<string, unknown>;
  };
}

export type SimulateAllowed = 'true' | 'false' | 'conditional';

export interface SimulateResponse {
  readonly ok: boolean;
  readonly resource: CardResource;
  readonly allowed: SimulateAllowed;
  readonly conditions: ReadonlyArray<string>;
  readonly suggestions: ReadonlyArray<string>;
  readonly gateway_decision?: {
    readonly verdict?: 'pass' | 'fail' | 'warn';
    readonly missing_receipts?: ReadonlyArray<string>;
  };
  readonly observer_assessment?: {
    readonly verdict?: 'pass' | 'fail' | 'warn';
  };
  readonly evaluated_at?: string;
}

export interface ExplainRemediation {
  readonly for: 'violation' | 'warning' | 'card_gap';
  readonly index: number;
  readonly remediation: string;
  readonly method?: string;
  readonly url?: string;
}

export interface ExplainResponse {
  readonly ok: boolean;
  readonly resource: CardResource;
  readonly trace?: {
    readonly verdict?: 'pass' | 'fail' | 'warn';
    readonly violations?: ReadonlyArray<unknown>;
    readonly warnings?: ReadonlyArray<unknown>;
    readonly card_gaps?: ReadonlyArray<unknown>;
  };
  readonly reasoning: string;
  readonly suggested_remediations: ReadonlyArray<ExplainRemediation>;
  readonly enriched?: boolean;
}

export interface SimulateCase {
  readonly agent_id: string;
  readonly resource: CardResource;
  readonly description: string;
  readonly candidate_input?: SimulateRequest['candidate_input'];
  readonly candidate_tool_call?: SimulateRequest['candidate_tool_call'];
}

export type FailureBehavior = 'hard_fail' | 'soft_warn' | 'pass';

export interface CiConfig {
  readonly behavior: {
    readonly on_allowed_false: FailureBehavior;
    readonly on_allowed_conditional: FailureBehavior;
    readonly on_allowed_true: FailureBehavior;
    readonly on_action_error: FailureBehavior;
  };
}

export interface PerManifestResult {
  readonly manifest: ChangedManifest;
  readonly effective?: EffectiveResponse;
  readonly effective_error?: string;
  readonly proposed_summary: Record<string, unknown>;
  readonly advisories: ReadonlyArray<string>;
  readonly simulate?: ReadonlyArray<{
    readonly case: SimulateCase;
    readonly response?: SimulateResponse;
    readonly error?: string;
  }>;
  readonly explain?: ExplainResponse;
  readonly explain_error?: string;
}
