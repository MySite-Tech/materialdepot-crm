import { createServer } from 'node:http';

class Reply {
  constructor(status, body) {
    this.status = status;
    this.body = body;
  }
}

export const reply = (status, body) => new Reply(status, body);

export function jsonOf(raw) {
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return undefined;
  }
}

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

export function serve(port, handler, onListen) {
  return createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, api-key, x-sync-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    const url = new URL(req.url, `http://localhost:${port}`);
    let out;
    try {
      const raw = await readBody(req);
      out = await handler({
        method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers, raw,
      });
    } catch (e) {
      out = reply(500, { error: e instanceof Error ? e.message : String(e) });
    }
    const { status, body } = out instanceof Reply ? out : { status: 200, body: out };
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body ?? null));
  }).listen(port, onListen);
}
