// =====================================================================
// Shared helpers for all Netlify Functions
// =====================================================================
// - Neon DB connection (lazy, reused per warm invocation)
// - Bearer token auth check
// - Standard CORS headers + JSON response helpers
// =====================================================================

const { neon } = require('@neondatabase/serverless');

let _sql = null;
function db() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    _sql = neon(url);
  }
  return _sql;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function preflight() {
  return { statusCode: 200, headers: CORS_HEADERS, body: '' };
}

function requireAuth(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const expected = process.env.APP_TOKEN;
  if (!expected) return { ok: false, status: 500, error: 'APP_TOKEN not configured on server' };
  if (header.replace('Bearer ', '') !== expected) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

function json(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function ok(body) { return json(200, body); }
function badRequest(msg) { return json(400, { error: msg }); }
function unauthorized(msg) { return json(401, { error: msg || 'Unauthorized' }); }
function notFound(msg) { return json(404, { error: msg || 'Not found' }); }
function serverError(err) {
  console.error('Function error:', err);
  return json(500, { error: err.message || String(err), type: err.constructor?.name });
}

// Strip the Netlify function prefix from the request path so handlers
// can match clean paths like '/contacts' or '/contact/123'.
function getPath(event, functionName) {
  const raw = event.path || '';
  return raw
    .replace(`/.netlify/functions/${functionName}`, '')
    .replace(`/api/${functionName}`, '')
    .replace('/.netlify/functions/api', '')
    .replace('/api', '') || '/';
}

function parseBody(event) {
  if (!event.body) return {};
  try { return JSON.parse(event.body); } catch { return {}; }
}

module.exports = {
  db,
  CORS_HEADERS,
  preflight,
  requireAuth,
  json,
  ok,
  badRequest,
  unauthorized,
  notFound,
  serverError,
  getPath,
  parseBody,
};
