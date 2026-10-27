import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { STICKY_COMMENT_MARKER } from '../src/render.js';
import type { PullRequestContext } from '../src/github.js';

// These tests drive src/github.ts through the real `@actions/github` →
// `@actions/http-client` → undici stack (the same stack ncc bundles into
// dist/index.js) against a local HTTP server. `@actions/github` reads
// GITHUB_API_URL once at module load, so the module is imported dynamically
// after the server is listening.

interface RecordedRequest {
  method: string;
  path: string;
  authorization: string | undefined;
  body: string;
}

type Reply = { status: number; json: unknown; encoding?: string };
type Handler = (req: RecordedRequest) => Reply;

let server: http.Server;
let handler: Handler;
let requests: RecordedRequest[];
let gh: typeof import('../src/github.js');

const PR: PullRequestContext = {
  owner: 'mnemom',
  repo: 'demo',
  pull_number: 7,
  head_sha: 'abc123',
};

function encode(payload: string, encoding: string | undefined): Buffer {
  let buf = Buffer.from(payload);
  if (!encoding) return buf;
  for (const coding of encoding.split(',').map((c) => c.trim())) {
    if (coding === 'gzip') buf = gzipSync(buf);
  }
  return buf;
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const recorded: RecordedRequest = {
        method: req.method ?? '',
        path: req.url ?? '',
        authorization: req.headers.authorization,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      requests.push(recorded);
      const reply = handler(recorded);
      const payload = encode(JSON.stringify(reply.json), reply.encoding);
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (reply.encoding) headers['content-encoding'] = reply.encoding;
      res.writeHead(reply.status, headers);
      res.end(payload);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.GITHUB_API_URL = `http://127.0.0.1:${port}`;
  gh = await import('../src/github.js');
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
});

function comment(id: number, body: string) {
  return { id, body, html_url: `https://github.com/mnemom/demo/pull/7#issuecomment-${id}` };
}

describe('upsertStickyComment over the bundled HTTP stack', () => {
  it('creates the sticky comment when none exists, with gzip responses', async () => {
    handler = (req) => {
      if (req.method === 'GET') return { status: 200, json: [comment(1, 'unrelated')], encoding: 'gzip' };
      return { status: 201, json: comment(99, JSON.parse(req.body).body), encoding: 'gzip' };
    };
    const body = `${STICKY_COMMENT_MARKER}\nhello`;

    const url = await gh.upsertStickyComment('tok-1', PR, body);

    expect(url).toBe('https://github.com/mnemom/demo/pull/7#issuecomment-99');
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /repos/mnemom/demo/issues/7/comments?per_page=100&page=1',
      'POST /repos/mnemom/demo/issues/7/comments',
    ]);
    expect(requests.every((r) => r.authorization === 'token tok-1')).toBe(true);
    expect(JSON.parse(requests[1].body)).toEqual({ body });
  });

  it('updates the existing sticky comment found on a later page', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => comment(i + 1, `other ${i}`));
    const page2 = [comment(501, `${STICKY_COMMENT_MARKER}\nold`)];
    handler = (req) => {
      if (req.method === 'GET') return { status: 200, json: req.path.endsWith('page=1') ? page1 : page2 };
      return { status: 200, json: comment(501, JSON.parse(req.body).body) };
    };
    const body = `${STICKY_COMMENT_MARKER}\nnew`;

    const url = await gh.upsertStickyComment('tok-1', PR, body);

    expect(url).toBe('https://github.com/mnemom/demo/pull/7#issuecomment-501');
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /repos/mnemom/demo/issues/7/comments?per_page=100&page=1',
      'GET /repos/mnemom/demo/issues/7/comments?per_page=100&page=2',
      'PATCH /repos/mnemom/demo/issues/comments/501',
    ]);
    expect(JSON.parse(requests[2].body)).toEqual({ body });
  });

  it('surfaces a GitHub API error instead of reporting a posted comment', async () => {
    handler = (req) =>
      req.method === 'GET'
        ? { status: 200, json: [] }
        : { status: 403, json: { message: 'Resource not accessible by integration' } };

    await expect(gh.upsertStickyComment('tok-1', PR, `${STICKY_COMMENT_MARKER}\nx`)).rejects.toThrow(
      /Resource not accessible by integration/,
    );
  });

  it('rejects a response with more than five content-encodings (undici fetch cap, GHSA-xjj6-f33q-929c)', async () => {
    handler = () => ({ status: 200, json: [], encoding: 'gzip, gzip, gzip, gzip, gzip, gzip' });

    await expect(gh.upsertStickyComment('tok-1', PR, `${STICKY_COMMENT_MARKER}\nx`)).rejects.toThrow(/too many content-encodings/);
    expect(requests.filter((r) => r.method !== 'GET')).toEqual([]);
  });
});

describe('listChangedFiles over the bundled HTTP stack', () => {
  it('pages through files and skips removed ones', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ filename: `f${i}.ts`, status: 'modified' }));
    const page2 = [
      { filename: '.mnemom/alignment.yaml', status: 'added' },
      { filename: 'gone.ts', status: 'removed' },
    ];
    handler = (req) => ({ status: 200, json: req.path.endsWith('page=1') ? page1 : page2, encoding: 'gzip' });

    const files = await gh.listChangedFiles('tok-1', PR);

    expect(files).toHaveLength(101);
    expect(files).toContain('.mnemom/alignment.yaml');
    expect(files).not.toContain('gone.ts');
    expect(requests.map((r) => r.path)).toEqual([
      '/repos/mnemom/demo/pulls/7/files?per_page=100&page=1',
      '/repos/mnemom/demo/pulls/7/files?per_page=100&page=2',
    ]);
  });
});
