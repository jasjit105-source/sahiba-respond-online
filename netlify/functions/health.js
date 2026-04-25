// =====================================================================
// /api/health — sanity check endpoint
// =====================================================================
// Use this after deploy to verify:
//  - Function is deployed
//  - DATABASE_URL is set and reachable
//  - APP_TOKEN auth is working
//
//   curl -H "Authorization: Bearer $APP_TOKEN" https://YOUR-SITE.netlify.app/api/health
// =====================================================================

const { db, preflight, requireAuth, ok, unauthorized, serverError } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const auth = requireAuth(event);
  if (!auth.ok) return unauthorized(auth.error);

  try {
    const sql = db();
    const result = await sql`SELECT NOW() as now, current_database() as database`;
    return ok({
      status: 'healthy',
      neon: { connected: true, ...result[0] },
      env: {
        has_database_url: !!process.env.DATABASE_URL,
        has_app_token: !!process.env.APP_TOKEN,
        node_version: process.version,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return serverError(err);
  }
};
