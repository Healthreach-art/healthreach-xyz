import assert from 'node:assert/strict';
import { readResponseJson } from '../lib/response-json.mjs';

const html503 = new Response('<!doctype html><html><body>Worker exceeded resource limits</body></html>', {
  status: 503,
  headers: { 'content-type': 'text/html' },
});
await assert.rejects(
  readResponseJson(html503, 'The app API'),
  /temporarily unavailable \(HTTP 503\).*retry in a moment/i,
);

const html404 = new Response('<!doctype html><html><body>Not found</body></html>', {
  status: 404,
  headers: { 'content-type': 'text/html' },
});
await assert.rejects(
  readResponseJson(html404, 'The app API'),
  /returned a website page instead of data \(HTTP 404\)/i,
);

const json = await readResponseJson(Response.json({ ready: true }));
assert.deepEqual(json, { ready: true });
console.log('API HTML error classification and JSON response parsing passed.');
