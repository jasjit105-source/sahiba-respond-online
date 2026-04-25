// =====================================================================
// /api/tracker/* — Respond Tracker backend
// =====================================================================
// Ported from nancy-tracker/netlify/functions/api.js to use the unified
// _shared.js helpers (auth, db, CORS).
//
// Endpoints (all require Bearer APP_TOKEN):
//   POST /api/tracker/init                — create tables + indexes
//   GET  /api/tracker/contacts            — agent's contact view (with handoff logic)
//   GET  /api/tracker/historial           — archived contacts
//   POST /api/tracker/upload              — body: {agent, contacts[]}
//   PUT  /api/tracker/contact/:id         — body: {agent, status?, notes?, whatsapp_sent?}
//   GET  /api/tracker/stats               — totals, by status, by agent
// =====================================================================

const {
  db, preflight, requireAuth, ok, badRequest, unauthorized,
  notFound, serverError, getPath, parseBody,
} = require('./_shared');

// ---------- helpers ----------
function tbl(a)  { return a === 'jazmin' ? 'jazmin_contacts'  : 'nancy_contacts'; }
function htbl(a) { return a === 'jazmin' ? 'jazmin_historial' : 'nancy_historial'; }
function validAgent(a) {
  return ['nancy', 'jazmin'].includes(String(a || '').toLowerCase())
    ? String(a).toLowerCase()
    : null;
}

// ---------- /init ----------
async function initDB() {
  const sql = db();
  for (const t of ['nancy_contacts', 'jazmin_contacts']) {
    await sql(`CREATE TABLE IF NOT EXISTS ${t} (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(200),
      buy_score INTEGER,
      win_status VARCHAR(50),
      agent VARCHAR(100),
      city VARCHAR(200),
      lifecycle VARCHAR(100),
      reasons TEXT,
      hours_since INTEGER,
      crm_score INTEGER,
      priority VARCHAR(10),
      status VARCHAR(50) DEFAULT 'Pendiente',
      notes TEXT DEFAULT '',
      whatsapp_sent BOOLEAN DEFAULT FALSE,
      whatsapp_sent_date TIMESTAMP,
      date_added TIMESTAMP DEFAULT NOW(),
      date_updated TIMESTAMP DEFAULT NOW(),
      is_new BOOLEAN DEFAULT TRUE,
      batch_date DATE DEFAULT CURRENT_DATE
    )`);
  }
  for (const t of ['nancy_historial', 'jazmin_historial']) {
    await sql(`CREATE TABLE IF NOT EXISTS ${t} (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      name VARCHAR(200),
      agent VARCHAR(100),
      city VARCHAR(200),
      lifecycle VARCHAR(100),
      crm_score INTEGER,
      status VARCHAR(50),
      notes TEXT,
      whatsapp_sent BOOLEAN DEFAULT FALSE,
      whatsapp_sent_date TIMESTAMP,
      date_added TIMESTAMP,
      date_archived TIMESTAMP DEFAULT NOW()
    )`);
  }
  // Backwards-compat: ensure whatsapp_sent_date column exists on older tables
  for (const t of ['nancy_contacts', 'jazmin_contacts', 'nancy_historial', 'jazmin_historial']) {
    try { await sql(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS whatsapp_sent_date TIMESTAMP`); } catch (_) {}
  }
  return { success: true };
}

// ---------- /contacts ----------
// Jazmin sees: her contacts < 85hrs OR her customers (any age)
async function getJazminContacts(filters) {
  const sql = db();
  const { status, search } = filters || {};
  const params = [];
  let where = `(crm_score IS NULL OR crm_score >= 400)
    AND ((hours_since IS NULL OR hours_since < 85)
         OR (lifecycle IS NOT NULL AND LOWER(lifecycle) = 'customer'))`;
  let i = 1;
  if (status && status !== 'all') { where += ` AND status = $${i++}`; params.push(status); }
  if (search) { where += ` AND (name ILIKE $${i} OR phone ILIKE $${i})`; params.push('%' + search + '%'); i++; }
  const q = `SELECT *, 'jazmin' as source FROM jazmin_contacts WHERE ${where}
             ORDER BY is_new DESC, crm_score DESC NULLS LAST, date_added DESC`;
  return await sql(q, params);
}

// Nancy sees: her own non-customer contacts (>=400) UNION Jazmin's >=85hr non-customers (excluding dupes)
async function getNancyContacts(filters) {
  const sql = db();
  const { status, search } = filters || {};

  // Explicit column list: old nancy_contacts had a type mismatch on whatsapp_sent_date;
  // COALESCE+::timestamp normalizes it across the UNION.
  const cols = `id, phone, name, buy_score, win_status, agent, city, lifecycle, reasons,
    hours_since, crm_score, priority, status, notes, whatsapp_sent,
    COALESCE(whatsapp_sent_date, NULL)::timestamp as whatsapp_sent_date,
    date_added, date_updated, is_new, batch_date`;

  const sql1 = `SELECT ${cols}, 'nancy' as source FROM nancy_contacts
    WHERE (lifecycle IS NULL OR LOWER(lifecycle) != 'customer')
      AND (crm_score IS NULL OR crm_score >= 400)`;

  const sql2 = `SELECT ${cols}, 'jazmin_handoff' as source FROM jazmin_contacts
    WHERE hours_since >= 85
      AND (lifecycle IS NULL OR LOWER(lifecycle) != 'customer')
      AND (crm_score IS NULL OR crm_score >= 400)
      AND phone NOT IN (SELECT phone FROM nancy_contacts)`;

  let q = `SELECT * FROM ((${sql1}) UNION ALL (${sql2})) combined WHERE 1=1`;
  const params = [];
  let i = 1;
  if (status && status !== 'all') { q += ` AND status = $${i++}`; params.push(status); }
  if (search) { q += ` AND (name ILIKE $${i} OR phone ILIKE $${i})`; params.push('%' + search + '%'); i++; }
  q += ` ORDER BY is_new DESC, crm_score DESC NULLS LAST, date_added DESC`;
  return await sql(q, params);
}

async function getContacts(agent, filters) {
  return agent === 'jazmin' ? getJazminContacts(filters) : getNancyContacts(filters);
}

// ---------- /historial ----------
async function getHistorial(agent, filters) {
  const sql = db();
  const t = htbl(agent);
  const { search } = filters || {};
  let q = `SELECT * FROM ${t} WHERE 1=1`;
  const params = [];
  let i = 1;
  if (search) { q += ` AND (name ILIKE $${i} OR phone ILIKE $${i})`; params.push('%' + search + '%'); i++; }
  q += ` ORDER BY date_archived DESC`;
  return await sql(q, params);
}

// ---------- /upload ----------
async function uploadContacts(agent, contacts) {
  const sql = db();
  const t = tbl(agent);
  const ht = htbl(agent);
  let newCount = 0, updatedCount = 0, archivedCount = 0, skippedCount = 0, cleanedCount = 0;

  // Archive contacts that have notes (preserve agent work before merge)
  const withNotes = await sql(`SELECT * FROM ${t} WHERE notes IS NOT NULL AND notes != ''`);
  for (const c of withNotes) {
    await sql(
      `INSERT INTO ${ht} (phone,name,agent,city,lifecycle,crm_score,status,notes,whatsapp_sent,whatsapp_sent_date,date_added)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [c.phone, c.name, c.agent, c.city, c.lifecycle, c.crm_score, c.status, c.notes, c.whatsapp_sent, c.whatsapp_sent_date, c.date_added]
    );
    archivedCount++;
  }

  // Cleanup: drop low-score non-customers from active table
  const cleaned = await sql(
    `DELETE FROM ${t}
     WHERE crm_score IS NOT NULL AND crm_score < 400
       AND (lifecycle IS NULL OR LOWER(lifecycle) != 'customer')
     RETURNING id`
  );
  cleanedCount = cleaned.length;

  // Mark all existing as not-new before merging the new batch
  await sql(`UPDATE ${t} SET is_new = FALSE WHERE is_new = TRUE`);

  // Merge new contacts
  for (const c of contacts) {
    const phone = String(c.phone || '').replace(/[^0-9]/g, '');
    if (!phone) continue;
    const isCustomer = c.lifecycle && String(c.lifecycle).toLowerCase().trim() === 'customer';
    if (!isCustomer && c.crm_score && Number(c.crm_score) < 400) { skippedCount++; continue; }

    const existing = await sql(`SELECT id FROM ${t} WHERE phone = $1`, [phone]);
    if (existing.length > 0) {
      await sql(
        `UPDATE ${t} SET
           name=$1, buy_score=$2, win_status=$3, agent=$4, city=$5,
           lifecycle=$6, reasons=$7, hours_since=$8, crm_score=$9, priority=$10,
           date_updated=NOW(), batch_date=CURRENT_DATE
         WHERE phone=$11`,
        [c.name || null, c.buy_score || null, c.window || null, c.agent || null, c.city || null,
         c.lifecycle || null, c.reasons || null, c.hours_since || null, c.crm_score || null, c.priority || null,
         phone]
      );
      updatedCount++;
    } else {
      await sql(
        `INSERT INTO ${t}
          (phone, name, buy_score, win_status, agent, city, lifecycle, reasons,
           hours_since, crm_score, priority, status, is_new, batch_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Pendiente',TRUE,CURRENT_DATE)`,
        [phone, c.name || null, c.buy_score || null, c.window || null, c.agent || null,
         c.city || null, c.lifecycle || null, c.reasons || null, c.hours_since || null,
         c.crm_score || null, c.priority || null]
      );
      newCount++;
    }
  }

  return { newCount, updatedCount, archivedCount, skippedCount, cleanedCount, total: contacts.length };
}

// ---------- /contact/:id ----------
async function updateContact(agent, id, updates) {
  const sql = db();
  // For Nancy view, the contact may actually live in jazmin_contacts (handoff)
  let t = tbl(agent);
  if (agent === 'nancy') {
    const inNancy = await sql(`SELECT id FROM nancy_contacts WHERE id = $1`, [id]);
    if (inNancy.length === 0) t = 'jazmin_contacts';
  }

  const { status, notes, whatsapp_sent } = updates;
  const sets = ['date_updated = NOW()'];
  const params = [];
  let i = 1;
  if (status !== undefined)        { sets.push(`status = $${i++}`); params.push(status); }
  if (notes !== undefined)         { sets.push(`notes = $${i++}`);  params.push(notes); }
  if (whatsapp_sent !== undefined) {
    sets.push(`whatsapp_sent = $${i++}`); params.push(whatsapp_sent);
    if (whatsapp_sent) sets.push('whatsapp_sent_date = NOW()');
  }
  params.push(id);
  await sql(`UPDATE ${t} SET ${sets.join(', ')} WHERE id = $${i}`, params);
  return { success: true };
}

// ---------- /stats ----------
async function getStats(agent) {
  const sql = db();
  if (agent === 'jazmin') {
    const f = `(crm_score IS NULL OR crm_score >= 400)
      AND ((hours_since IS NULL OR hours_since < 85)
           OR (lifecycle IS NOT NULL AND LOWER(lifecycle) = 'customer'))`;
    const total    = await sql(`SELECT COUNT(*) as count FROM jazmin_contacts WHERE ${f}`);
    const byStatus = await sql(`SELECT status, COUNT(*) as count FROM jazmin_contacts WHERE ${f} GROUP BY status ORDER BY count DESC`);
    const newToday = await sql(`SELECT COUNT(*) as count FROM jazmin_contacts WHERE is_new = TRUE AND ${f}`);
    const byAgent  = await sql(`SELECT agent, COUNT(*) as count FROM jazmin_contacts WHERE ${f} GROUP BY agent ORDER BY count DESC`);
    const histCount = await sql(`SELECT COUNT(*) as count FROM jazmin_historial`);
    return {
      total: total[0].count,
      newToday: newToday[0].count,
      byStatus, byAgent,
      historialCount: histCount[0].count,
    };
  }

  // Nancy: her active + Jazmin's handoffs
  const nf = `(lifecycle IS NULL OR LOWER(lifecycle) != 'customer') AND (crm_score IS NULL OR crm_score >= 400)`;
  const jf = `hours_since >= 85
    AND (lifecycle IS NULL OR LOWER(lifecycle) != 'customer')
    AND (crm_score IS NULL OR crm_score >= 400)
    AND phone NOT IN (SELECT phone FROM nancy_contacts)`;

  const t1 = await sql(`SELECT COUNT(*) as count FROM nancy_contacts  WHERE ${nf}`);
  const t2 = await sql(`SELECT COUNT(*) as count FROM jazmin_contacts WHERE ${jf}`);
  const totalCount = parseInt(t1[0].count) + parseInt(t2[0].count);

  const byStatus = await sql(
    `SELECT status, SUM(cnt)::int as count FROM (
       SELECT status, COUNT(*) as cnt FROM nancy_contacts  WHERE ${nf} GROUP BY status
       UNION ALL
       SELECT status, COUNT(*) as cnt FROM jazmin_contacts WHERE ${jf} GROUP BY status
     ) sub GROUP BY status ORDER BY count DESC`
  );
  const newN = await sql(`SELECT COUNT(*) as count FROM nancy_contacts  WHERE is_new = TRUE AND ${nf}`);
  const newJ = await sql(`SELECT COUNT(*) as count FROM jazmin_contacts WHERE is_new = TRUE AND ${jf}`);
  const newCount = parseInt(newN[0].count) + parseInt(newJ[0].count);

  const byAgent = await sql(
    `SELECT agent, SUM(cnt)::int as count FROM (
       SELECT agent, COUNT(*) as cnt FROM nancy_contacts  WHERE ${nf} GROUP BY agent
       UNION ALL
       SELECT agent, COUNT(*) as cnt FROM jazmin_contacts WHERE ${jf} GROUP BY agent
     ) sub GROUP BY agent ORDER BY count DESC`
  );
  const histCount = await sql(`SELECT COUNT(*) as count FROM nancy_historial`);
  return {
    total: totalCount,
    newToday: newCount,
    byStatus, byAgent,
    historialCount: histCount[0].count,
  };
}

// ---------- handler ----------
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const auth = requireAuth(event);
  if (!auth.ok) return unauthorized(auth.error);

  try {
    const path = getPath(event, 'tracker');
    const method = event.httpMethod;
    const qs = event.queryStringParameters || {};

    if (method === 'POST' && path === '/init') {
      return ok(await initDB());
    }

    const bodyAgent = method !== 'GET' ? parseBody(event).agent : null;
    const agent = validAgent(qs.agent || bodyAgent);

    if (method === 'GET' && path === '/contacts') {
      if (!agent) return badRequest('agent required');
      return ok(await getContacts(agent, qs));
    }
    if (method === 'GET' && path === '/historial') {
      if (!agent) return badRequest('agent required');
      return ok(await getHistorial(agent, qs));
    }
    if (method === 'POST' && path === '/upload') {
      const body = parseBody(event);
      const a = validAgent(body.agent);
      if (!a) return badRequest('agent required');
      return ok(await uploadContacts(a, body.contacts || []));
    }
    if (method === 'PUT' && path.startsWith('/contact/')) {
      const id = parseInt(path.split('/').pop(), 10);
      const body = parseBody(event);
      const a = validAgent(body.agent || qs.agent);
      if (!a) return badRequest('agent required');
      return ok(await updateContact(a, id, body));
    }
    if (method === 'GET' && path === '/stats') {
      if (!agent) return badRequest('agent required');
      return ok(await getStats(agent));
    }
    return notFound();
  } catch (err) {
    return serverError(err);
  }
};
