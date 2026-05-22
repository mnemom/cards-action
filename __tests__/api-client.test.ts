import { describe, it, expect, vi } from 'vitest';
import { MnemomApiClient } from '../src/api-client.js';
import type { EffectiveResponse, SimulateResponse } from '../src/types.js';

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init ?? {});
  }) as unknown as typeof fetch;
}

describe('MnemomApiClient', () => {
  it('rejects an empty API key at construction', () => {
    expect(() => new MnemomApiClient({ apiKey: '', baseUrl: 'https://x' })).toThrow();
  });

  it('issues GET /v1/<resource>/agent/<id>/effective with header', async () => {
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toBe('https://api.mnemom.ai/v1/alignment/agent/smolt-x/effective');
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Mnemom-Api-Key']).toBe('test-key-1234');
      const body: EffectiveResponse = { agent_id: 'smolt-x', autonomy_mode: 'observe' };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const client = new MnemomApiClient({
      apiKey: 'test-key-1234',
      baseUrl: 'https://api.mnemom.ai',
      fetchImpl,
    });
    const result = await client.getEffective('alignment', 'smolt-x');
    expect(result.agent_id).toBe('smolt-x');
  });

  it('issues POST /simulate with body', async () => {
    const fetchImpl = mockFetch((url, init) => {
      expect(url).toContain('/simulate');
      expect(init.method).toBe('POST');
      const body: SimulateResponse = {
        ok: true,
        resource: 'alignment',
        allowed: 'true',
        conditions: [],
        suggestions: [],
      };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const client = new MnemomApiClient({
      apiKey: 'test-key-1234',
      baseUrl: 'https://api.mnemom.ai',
      fetchImpl,
    });
    const result = await client.simulate('alignment', 'smolt-x', {
      candidate_tool_call: { tool_name: 'send' },
    });
    expect(result.allowed).toBe('true');
  });

  it('throws an ApiError on non-2xx', async () => {
    const fetchImpl = mockFetch(() => new Response('{"err":"oops"}', { status: 500 }));
    const client = new MnemomApiClient({
      apiKey: 'test-key-1234',
      baseUrl: 'https://api.mnemom.ai',
      fetchImpl,
    });
    await expect(client.getEffective('alignment', 'smolt-x')).rejects.toThrow(/500/);
  });

  it('escapes path components', async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toContain('smolt-with%20space');
      const body: EffectiveResponse = {};
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const client = new MnemomApiClient({
      apiKey: 'test-key-1234',
      baseUrl: 'https://api.mnemom.ai',
      fetchImpl,
    });
    await client.getEffective('alignment', 'smolt-with space');
  });

  it('strips trailing slash from base URL', async () => {
    const fetchImpl = mockFetch((url) => {
      expect(url).toBe('https://api.mnemom.ai/v1/protection/agent/smolt-x/explain');
      return new Response('{}', { status: 200 });
    });
    const client = new MnemomApiClient({
      apiKey: 'test-key-1234',
      baseUrl: 'https://api.mnemom.ai/',
      fetchImpl,
    });
    await client.explain('protection', 'smolt-x');
  });
});
