import type {
  CardResource,
  EffectiveResponse,
  ExplainResponse,
  SimulateRequest,
  SimulateResponse,
} from './types.js';

export interface MnemomClientOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface ApiError {
  readonly status: number;
  readonly message: string;
  readonly body?: string;
}

export class MnemomApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: MnemomClientOptions) {
    if (!opts.apiKey || opts.apiKey.length < 8) {
      throw new Error(
        'Mnemom API key would benefit from being set — receive it via the api-key input.',
      );
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async getEffective(resource: CardResource, agentId: string): Promise<EffectiveResponse> {
    const path = `/v1/${resource}/agent/${encodeURIComponent(agentId)}/effective`;
    return this.request<EffectiveResponse>('GET', path);
  }

  async simulate(
    resource: CardResource,
    agentId: string,
    body: SimulateRequest,
  ): Promise<SimulateResponse> {
    const path = `/v1/${resource}/agent/${encodeURIComponent(agentId)}/simulate`;
    return this.request<SimulateResponse>('POST', path, body);
  }

  async explain(
    resource: CardResource,
    agentId: string,
    body: { enrich?: boolean } = {},
  ): Promise<ExplainResponse> {
    const path = `/v1/${resource}/agent/${encodeURIComponent(agentId)}/explain`;
    return this.request<ExplainResponse>('POST', path, body);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = `${this.baseUrl}${path}`;
      const init: RequestInit = {
        method,
        headers: {
          'X-Mnemom-Api-Key': this.apiKey,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: controller.signal,
      };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      const res = await this.fetchImpl(url, init);
      const text = await res.text();
      if (!res.ok) {
        const apiErr: ApiError = {
          status: res.status,
          message: `Mnemom API ${method} ${path} responded ${res.status}.`,
          body: text.slice(0, 4_000),
        };
        const e = new Error(apiErr.message) as Error & { apiError: ApiError };
        e.apiError = apiErr;
        throw e;
      }
      if (!text) return {} as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Mnemom API ${method} ${path} returned non-JSON body.`);
      }
    } finally {
      clearTimeout(t);
    }
  }
}
