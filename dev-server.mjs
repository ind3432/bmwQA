// Tiny zero-dep dev server. Mirrors the production routing:
//   - GET *           → serves files from ./public
//   - POST /api/generate → proxies Gemini, hiding GEMINI_API_KEY
// Run with: node --env-file=.env.local dev-server.mjs

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = resolve(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

const MODEL = 'gemini-2.5-flash-image';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readBody(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > max) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleGenerate(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendJSON(res, 500, { error: 'GEMINI_API_KEY is not set.' });
  }

  let parsed;
  try {
    const raw = await readBody(req);
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return sendJSON(res, 400, { error: 'Invalid JSON body.' });
  }

  const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';
  if (!prompt || prompt.length > 2000) {
    return sendJSON(res, 400, { error: 'Invalid prompt.' });
  }

  try {
    const upstream = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('Gemini upstream', upstream.status, detail.slice(0, 400));
      return sendJSON(res, 502, { error: `Upstream error (${upstream.status}).` });
    }

    const data = await upstream.json();
    if (data?.promptFeedback?.blockReason) {
      return sendJSON(res, 422, {
        error: `Prompt blocked (${data.promptFeedback.blockReason}).`,
      });
    }

    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p?.inlineData?.data);
    if (!imagePart) {
      return sendJSON(res, 502, { error: 'No image returned by the model.' });
    }

    return sendJSON(res, 200, {
      mimeType: imagePart.inlineData.mimeType || 'image/png',
      data: imagePart.inlineData.data,
    });
  } catch (err) {
    console.error('generate error', err);
    return sendJSON(res, 500, { error: 'Generation failed.' });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_DIR, safe);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const buf = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/generate') {
      return handleGenerate(req, res);
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(req, res);
    }
    res.writeHead(405);
    res.end('Method not allowed');
  } catch (err) {
    console.error('handler error', err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  const keyStatus = process.env.GEMINI_API_KEY ? 'key loaded' : 'NO KEY';
  console.log(`▲ BMW · AI Configurator running on http://localhost:${PORT}  [${keyStatus}]`);
});
