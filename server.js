import express from 'express';
import cors from 'cors';
import multer from 'multer';
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, 'uploads');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm)$/i;
    if (allowed.test(extname(file.originalname))) cb(null, true);
    else cb(new Error('Only image and video files allowed'));
  }
});
const PORT = 3001;
const DB_PATH = join(__dirname, 'db', 'sahiba.db');

// ═══ CONFIG ═══
const PIPEBOARD_URL = 'https://mcp.pipeboard.co/meta-ads-mcp';
const PIPEBOARD_TOKEN = 'pk_d03000807b8a4676bb78f6a90ed08e25';
const AD_ACCOUNT_ID = 'act_4022620911308267';

// ═══ DATABASE (sql.js) ═══
let db;

// sql.js helper wrappers to match better-sqlite3 style
function run(sql, params = []) {
  db.run(sql, params);
  const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0;
  saveDb();
  return lastId;
}
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}
function all(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}
function saveDb() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

// ═══ PIPEBOARD MCP CLIENT ═══
const TIKTOK_MCP_URL = 'https://mcp.pipeboard.co/tiktok-ads-mcp';
let requestId = 0;

// TikTok MCP — same Bearer auth, different endpoint
async function tiktokCall(toolName, args = {}) {
  requestId++;
  const res = await fetch(TIKTOK_MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Authorization': `Bearer ${PIPEBOARD_TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: requestId, params: { name: toolName, arguments: args } })
  });
  const raw = await res.text();
  let parsed;
  if (raw.startsWith('event:') || raw.startsWith('data:')) {
    for (const line of raw.split('\n')) {
      if (line.startsWith('data:')) { try { parsed = JSON.parse(line.slice(5).trim()); break; } catch {} }
    }
  } else { try { parsed = JSON.parse(raw); } catch { return { raw }; } }
  // Unwrap content[0].text → inner JSON
  const txt = parsed?.result?.content?.[0]?.text;
  if (txt) { try { return JSON.parse(txt); } catch { return { raw: txt }; } }
  return parsed?.result || parsed;
}

async function mcpCall(toolName, args = {}) {
  requestId++;
  const payload = {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: requestId,
    params: { name: toolName, arguments: args }
  };

  const res = await fetch(PIPEBOARD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${PIPEBOARD_TOKEN}`
    },
    body: JSON.stringify(payload)
  });

  const raw = await res.text();

  if (raw.startsWith('event:') || raw.startsWith('data:')) {
    for (const line of raw.split('\n')) {
      if (line.startsWith('data:')) {
        try {
          const parsed = JSON.parse(line.slice(5).trim());
          return parsed.result || parsed.params || parsed;
        } catch { continue; }
      }
    }
    return { raw };
  }
  return JSON.parse(raw);
}

// Direct Meta Graph API — bypasses Pipeboard's 6-param cap.
// Used when we need full creative wiring (WhatsApp CTA + wa.me link) that
// Pipeboard's create_existing_post_ad_creative tool refuses to forward.
// Token + app_id are stored in the settings table (meta_access_token, meta_app_id).
const GRAPH_API_VERSION = 'v22.0';
async function graphCall(method, path, params = {}) {
  const tokenRow = (() => { try { return db.exec("SELECT value FROM settings WHERE key='meta_access_token'")?.[0]?.values?.[0]?.[0]; } catch { return null; } })();
  // fall back to direct sqlite if db.exec helper isn't available in this scope
  let token = tokenRow;
  if (!token) {
    const r = get("SELECT value FROM settings WHERE key='meta_access_token'");
    token = r?.value;
  }
  if (!token) throw new Error('meta_access_token not set in CRM settings. Configure in the Promote IG tab.');
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}${path.startsWith('/') ? path : '/' + path}`);
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    url.searchParams.set('access_token', token);
  } else {
    const body = { ...params, access_token: token };
    // Meta expects nested objects as JSON-serialized form fields, not deep JSON.
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    opts.body = form.toString();
    opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  }
  const res = await fetch(url.toString(), opts);
  const txt = await res.text();
  let parsed; try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
  if (!res.ok) {
    const e = parsed?.error || { message: txt };
    throw new Error(`Graph API ${res.status}: ${e.message || JSON.stringify(e)} (subcode ${e.error_subcode || '—'}, fbtrace ${e.fbtrace_id || '—'})`);
  }
  return parsed;
}

function extractText(mcpResult) {
  if (!mcpResult) return null;
  const content = mcpResult.result?.content || mcpResult.content;
  if (content) {
    const texts = content.filter(c => c.type === 'text').map(c => c.text);
    if (texts.length) {
      try { return JSON.parse(texts.join('')); }
      catch { return texts.join(''); }
    }
  }
  return mcpResult;
}

// ═══ CAMPAIGN CATEGORY DETECTION ═══
const BEACHFRONT = ['cabo san lucas','puerto vallarta','sayulita','punta mita','cancún','cancun','playa del carmen','tulum','isla mujeres','cozumel','mazatlán','mazatlan','huatulco','ixtapa','zihuatanejo','bacalar','holbox','progreso','celestún','celestun'];
const WHOLESALE = ['guadalajara','monterrey','puebla','querétaro','queretaro','león','leon','mérida','merida','veracruz','tuxtla gutiérrez','tuxtla gutierrez','villahermosa'];
const TESTING = ['cdmx','mixcalco','cuauhtémoc','cuauhtemoc','chihuahua','mexico city','ciudad de mexico'];

function detectCategory(campaignName) {
  const lower = campaignName.toLowerCase();
  if (lower.includes('retarget') || lower.includes('remarket')) return 'RETARGET';
  for (const city of BEACHFRONT) { if (lower.includes(city)) return 'BEACHFRONT'; }
  for (const city of WHOLESALE) { if (lower.includes(city)) return 'WHOLESALE'; }
  for (const city of TESTING) { if (lower.includes(city)) return 'TESTING'; }
  return 'UNCATEGORIZED';
}

// ═══ AI LABEL LOGIC ═══
function computeAiLabel(campaign, insights) {
  if (!insights || !insights.spend) return 'MONITOR';
  const spend = parseFloat(insights.spend) || 0;
  const clicks = parseInt(insights.clicks) || 0;
  const ctr = parseFloat(insights.ctr) || 0;
  const frequency = parseFloat(insights.frequency) || 0;

  if (campaign.status === 'PAUSED') return 'PAUSE';
  if (spend > 20 && clicks < 5) return 'FIX';
  if (frequency > 3.5) return 'FIX';
  if (ctr > 2 && spend < 50) return 'SCALE';
  if (ctr > 1 && spend > 0) return 'MONITOR';
  if (spend > 10 && ctr < 0.5) return 'FIX';
  return 'MONITOR';
}

// ═══ ALERT GENERATION ═══
function generateAlerts(campaigns, insightsMap) {
  const alerts = [];
  for (const c of campaigns) {
    const ins = insightsMap[c.meta_id];
    if (!ins) continue;
    const spend = parseFloat(ins.spend) || 0;
    const clicks = parseInt(ins.clicks) || 0;
    const ctr = parseFloat(ins.ctr) || 0;
    const frequency = parseFloat(ins.frequency) || 0;

    if (spend > 15 && clicks === 0) {
      alerts.push({ type: 'high_spend_no_clicks', severity: 'critical', message: `"${c.name}" spent $${spend.toFixed(2)} with 0 clicks`, campaign_meta_id: c.meta_id });
    }
    if (frequency > 3.5) {
      alerts.push({ type: 'creative_fatigue', severity: 'warning', message: `"${c.name}" frequency at ${frequency.toFixed(1)} — audience is oversaturated`, campaign_meta_id: c.meta_id });
    }
    if (spend > 10 && ctr < 0.3) {
      alerts.push({ type: 'low_ctr', severity: 'warning', message: `"${c.name}" CTR is ${ctr.toFixed(2)}% — creative may need refresh`, campaign_meta_id: c.meta_id });
    }
    if (c.status === 'ACTIVE' && spend === 0) {
      alerts.push({ type: 'active_no_spend', severity: 'info', message: `"${c.name}" is active but has $0 spend — check delivery`, campaign_meta_id: c.meta_id });
    }
  }
  return alerts;
}

// ═══ SYNC FROM PIPEBOARD ═══
async function syncFromPipeboard() {
  console.log('  Syncing from Pipeboard...');

  // 1. Campaigns
  try {
    const campResult = extractText(await mcpCall('get_campaigns', { account_id: AD_ACCOUNT_ID }));
    const campaigns = campResult?.data || (Array.isArray(campResult) ? campResult : []);
    for (const c of campaigns) {
      const category = detectCategory(c.name);
      run(`INSERT INTO campaigns (meta_id, name, objective, status, category, buying_type, daily_budget, lifetime_budget, start_time, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(meta_id) DO UPDATE SET
          name=excluded.name, objective=excluded.objective, status=excluded.status,
          category=excluded.category, buying_type=excluded.buying_type,
          daily_budget=excluded.daily_budget, lifetime_budget=excluded.lifetime_budget,
          start_time=excluded.start_time, updated_at=datetime('now')`,
        [c.id, c.name, c.objective, c.status || c.effective_status, category, c.buying_type,
         c.daily_budget ? c.daily_budget / 100 : null, c.lifetime_budget ? c.lifetime_budget / 100 : null, c.start_time]);
    }
    console.log(`  Synced ${campaigns.length} campaigns`);
  } catch (e) { console.error('  Campaign sync error:', e.message); }

  // 2. Ad sets
  try {
    const adsetResult = extractText(await mcpCall('get_adsets', { account_id: AD_ACCOUNT_ID }));
    const adsets = adsetResult?.data || (Array.isArray(adsetResult) ? adsetResult : []);
    for (const a of adsets) {
      run(`INSERT INTO adsets (meta_id, campaign_meta_id, name, status, optimization_goal, billing_event, daily_budget, lifetime_budget, targeting_json, start_time, end_time, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(meta_id) DO UPDATE SET
          name=excluded.name, status=excluded.status, optimization_goal=excluded.optimization_goal,
          daily_budget=excluded.daily_budget, targeting_json=excluded.targeting_json, updated_at=datetime('now')`,
        [a.id, a.campaign_id, a.name, a.status || a.effective_status, a.optimization_goal || null, a.billing_event || null,
         a.daily_budget ? parseFloat(a.daily_budget) / 100 : null, a.lifetime_budget ? parseFloat(a.lifetime_budget) / 100 : null,
         JSON.stringify(a.targeting || {}), a.start_time || null, a.end_time || null]);
    }
    console.log(`  Synced ${adsets.length} ad sets`);
  } catch (e) { console.error('  Adset sync error:', e.message); }

  // 3. Ads
  try {
    const adsResult = extractText(await mcpCall('get_ads', { account_id: AD_ACCOUNT_ID }));
    const ads = adsResult?.data || (Array.isArray(adsResult) ? adsResult : []);
    for (const a of ads) {
      run(`INSERT INTO ads (meta_id, adset_meta_id, campaign_meta_id, name, status, creative_meta_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(meta_id) DO UPDATE SET name=excluded.name, status=excluded.status, updated_at=datetime('now')`,
        [a.id, a.adset_id || null, a.campaign_id || null, a.name, a.status || a.effective_status, a.creative?.id || null]);
    }
    console.log(`  Synced ${ads.length} ads`);
  } catch (e) { console.error('  Ads sync error:', e.message); }

  // 4. Insights — pull last 120 days with DAILY breakdown so dashboard has real
  //    per-day rows. Without time_range + time_breakdown Pipeboard returns a
  //    single lifetime summary per ad stamped with one date (the bug that left
  //    the table frozen at 2025-06-12).
  try {
    const until = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    const insResult = extractText(await mcpCall('get_insights', {
      object_id: AD_ACCOUNT_ID,
      level: 'ad',
      time_range: { since, until },
      time_breakdown: 'day'
    }));
    const insights = insResult?.data || (Array.isArray(insResult) ? insResult : []);
    let insightCount = 0;
    const seenCampaigns = new Set();

    for (const i of insights) {
      if (!i.ad_id) continue;

      // Also create campaign records for campaigns found in insights but not in current list
      if (i.campaign_id && !seenCampaigns.has(i.campaign_id)) {
        seenCampaigns.add(i.campaign_id);
        const category = detectCategory(i.campaign_name || '');
        run(`INSERT INTO campaigns (meta_id, name, objective, status, category, updated_at)
          VALUES (?, ?, 'OUTCOME_ENGAGEMENT', 'ARCHIVED', ?, datetime('now'))
          ON CONFLICT(meta_id) DO UPDATE SET updated_at=datetime('now')`,
          [i.campaign_id, i.campaign_name || `Campaign ${i.campaign_id}`, category]);
      }

      // Also create ad records from insights
      if (i.ad_id) {
        run(`INSERT INTO ads (meta_id, adset_meta_id, campaign_meta_id, name, status, updated_at)
          VALUES (?, ?, ?, ?, 'ARCHIVED', datetime('now'))
          ON CONFLICT(meta_id) DO UPDATE SET updated_at=datetime('now')`,
          [i.ad_id, i.adset_id || null, i.campaign_id || null, i.ad_name || `Ad ${i.ad_id}`]);
      }

      const linkClicks = i.actions?.find(a => a.action_type === 'link_click')?.value || 0;
      const dateVal = i.date_start || new Date().toISOString().split('T')[0];
      run(`INSERT INTO insights_daily (date, campaign_meta_id, campaign_name, adset_meta_id, adset_name, ad_meta_id, ad_name,
          impressions, clicks, link_clicks, spend, cpc, cpm, ctr, reach, frequency, unique_clicks, actions_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, ad_meta_id) DO UPDATE SET
          spend=excluded.spend, impressions=excluded.impressions, clicks=excluded.clicks,
          cpc=excluded.cpc, cpm=excluded.cpm, ctr=excluded.ctr, reach=excluded.reach,
          frequency=excluded.frequency, actions_json=excluded.actions_json`,
        [dateVal, i.campaign_id || null, i.campaign_name || null, i.adset_id || null, i.adset_name || null, i.ad_id, i.ad_name || null,
         parseInt(i.impressions) || 0, parseInt(i.clicks) || 0, parseInt(linkClicks),
         parseFloat(i.spend) || 0, parseFloat(i.cpc) || 0, parseFloat(i.cpm) || 0,
         parseFloat(i.ctr) || 0, parseInt(i.reach) || 0, parseFloat(i.frequency) || 0,
         parseInt(i.unique_clicks) || 0, JSON.stringify(i.actions || [])]);
      insightCount++;
    }
    console.log(`  Synced ${insightCount} insight rows (${seenCampaigns.size} campaigns from insights)`);
  } catch (e) { console.error('  Insights sync error:', e.message); }

  // 5. AI labels + Alerts
  try {
    const allCamps = all('SELECT * FROM campaigns');
    for (const camp of allCamps) {
      const campInsights = get(`SELECT SUM(spend) as spend, SUM(clicks) as clicks, AVG(ctr) as ctr, AVG(frequency) as frequency
        FROM insights_daily WHERE campaign_meta_id = ?`, [camp.meta_id]);
      const label = computeAiLabel(camp, campInsights);
      run('UPDATE campaigns SET ai_label = ? WHERE meta_id = ?', [label, camp.meta_id]);
    }

    run("DELETE FROM alerts WHERE resolved = 0");
    const insightsMap = {};
    for (const camp of allCamps) {
      insightsMap[camp.meta_id] = get(`SELECT SUM(spend) as spend, SUM(clicks) as clicks, AVG(ctr) as ctr, AVG(frequency) as frequency
        FROM insights_daily WHERE campaign_meta_id = ?`, [camp.meta_id]);
    }
    const newAlerts = generateAlerts(allCamps, insightsMap);
    for (const a of newAlerts) {
      run('INSERT INTO alerts (type, severity, message, campaign_meta_id) VALUES (?, ?, ?, ?)',
        [a.type, a.severity, a.message, a.campaign_meta_id]);
    }
    console.log(`  Generated ${newAlerts.length} alerts`);
  } catch (e) { console.error('  Labels/alerts error:', e.message); }

  console.log('  Sync complete!');
}

// ═══ EXPRESS APP ═══
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

// --- Dashboard ---
app.get('/api/dashboard', (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];

  const totals = get(`SELECT
    COALESCE(SUM(spend), 0) as total_spend, COALESCE(SUM(impressions), 0) as total_impressions,
    COALESCE(SUM(clicks), 0) as total_clicks, COALESCE(SUM(link_clicks), 0) as total_link_clicks,
    COALESCE(SUM(reach), 0) as total_reach,
    CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks) * 100.0 / SUM(impressions), 2) ELSE 0 END as avg_ctr,
    CASE WHEN SUM(clicks) > 0 THEN ROUND(SUM(spend) / SUM(clicks), 2) ELSE 0 END as avg_cpc,
    CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(spend) * 1000.0 / SUM(impressions), 2) ELSE 0 END as avg_cpm
    FROM insights_daily WHERE date >= ? AND date <= ?`, [dateFrom, dateTo]) || {};

  const dailyTrend = all(`SELECT date, SUM(spend) as spend, SUM(clicks) as clicks, SUM(link_clicks) as link_clicks,
    SUM(impressions) as impressions, SUM(reach) as reach
    FROM insights_daily WHERE date >= ? AND date <= ? GROUP BY date ORDER BY date`, [dateFrom, dateTo]);

  const campaignPerf = all(`SELECT c.meta_id, c.name, c.status, c.category, c.ai_label,
    COALESCE(SUM(i.spend), 0) as spend, COALESCE(SUM(i.clicks), 0) as clicks,
    COALESCE(SUM(i.link_clicks), 0) as link_clicks, COALESCE(SUM(i.impressions), 0) as impressions,
    CASE WHEN SUM(i.impressions) > 0 THEN ROUND(SUM(i.clicks) * 100.0 / SUM(i.impressions), 2) ELSE 0 END as ctr,
    CASE WHEN SUM(i.clicks) > 0 THEN ROUND(SUM(i.spend) / SUM(i.clicks), 2) ELSE 0 END as cpc,
    AVG(i.frequency) as frequency
    FROM campaigns c LEFT JOIN insights_daily i ON i.campaign_meta_id = c.meta_id AND i.date >= ? AND i.date <= ?
    GROUP BY c.meta_id ORDER BY spend DESC`, [dateFrom, dateTo]);

  const funnel = {
    clicks: totals.total_link_clicks || 0,
    whatsapp: (get("SELECT COUNT(*) as c FROM funnel_events WHERE event_type = 'whatsapp_open'") || {}).c || 0,
    conversations: (get("SELECT COUNT(*) as c FROM funnel_events WHERE event_type = 'conversation_start'") || {}).c || 0,
    qualified: (get("SELECT COUNT(*) as c FROM leads WHERE stage IN ('warm','hot','customer')") || {}).c || 0,
    hot: (get("SELECT COUNT(*) as c FROM leads WHERE stage = 'hot'") || {}).c || 0,
    sales: (get("SELECT COUNT(*) as c FROM sales") || {}).c || 0
  };

  const totalSales = (get("SELECT COALESCE(SUM(amount), 0) as total FROM sales") || {}).total || 0;
  const alerts = all("SELECT * FROM alerts WHERE resolved = 0 ORDER BY severity DESC, created_at DESC LIMIT 10");

  res.json({ totals, dailyTrend, campaignPerf, funnel, totalSales, alerts });
});

// --- Live Analytics (Pipeboard direct) ---
const xA = (actions, type) => {
  if (!actions) return 0;
  const f = actions.find(x => x.action_type === type);
  return f ? parseInt(f.value) : 0;
};

app.get('/api/analytics', async (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];
  const timeRange = { since: dateFrom, until: dateTo };
  const t0 = Date.now();

  try {
    // Multi-account: Sahiba-MX is the only LIVE account (SAHIBA2026 cut off 2026-06-29
    // — Meta restriction made it unusable; see project_sahiba2026_winding_down memory).
    // Each insight type runs in parallel per account; results concat'd before parsing.
    const ACCTS = [
      { id: 'act_1622779349328736', name: 'Sahiba-MX' },
    ];
    const fetchForAcct = (acct) => Promise.all([
      mcpCall('get_insights', { object_id: acct.id, level: 'campaign', time_range: timeRange }),
      mcpCall('get_insights', { object_id: acct.id, level: 'account', time_range: timeRange, time_breakdown: 'day' }),
      mcpCall('get_insights', { object_id: acct.id, level: 'ad', time_range: timeRange }),
      mcpCall('get_insights', { object_id: acct.id, level: 'account', time_range: timeRange, breakdown: 'hourly_stats_aggregated_by_advertiser_time_zone' }).catch(e => ({ _err: e.message }))
    ]);
    const perAcct = await Promise.all(ACCTS.map(fetchForAcct));

    // Concat campaign + ad data with account tag
    const campList = [];
    const adsList = [];
    const dailyAggregator = {}; // date → merged daily totals
    let hourlyData = null;
    perAcct.forEach((acctResults, idx) => {
      const acctName = ACCTS[idx].name;
      const [campRaw, dailyRaw, adsRaw, hourlyRaw] = acctResults;
      const cD = extractText(campRaw); const dD = extractText(dailyRaw); const aD = extractText(adsRaw);
      const hD = hourlyRaw?._err ? null : extractText(hourlyRaw);
      (cD?.data || []).forEach(c => { c._account = acctName; campList.push(c); });
      (aD?.data || []).forEach(a => { a._account = acctName; adsList.push(a); });
      // Merge daily into aggregator
      const segs = dD?.segmented_metrics || dD?.data || (Array.isArray(dD) ? dD : []);
      for (const seg of segs) {
        const m = seg.metrics || seg;
        const date = seg.period || seg.date_start || m.date_start;
        if (!date) continue;
        if (!dailyAggregator[date]) dailyAggregator[date] = { metrics: { spend: 0, impressions: 0, clicks: 0, reach: 0, actions: [] } };
        const tgt = dailyAggregator[date].metrics;
        tgt.spend = (parseFloat(tgt.spend) || 0) + (parseFloat(m.spend) || 0);
        tgt.impressions = (parseInt(tgt.impressions) || 0) + (parseInt(m.impressions) || 0);
        tgt.clicks = (parseInt(tgt.clicks) || 0) + (parseInt(m.clicks) || 0);
        tgt.reach = (parseInt(tgt.reach) || 0) + (parseInt(m.reach) || 0);
        // Merge actions array
        for (const act of (m.actions || [])) {
          const existing = tgt.actions.find(x => x.action_type === act.action_type);
          if (existing) existing.value = (parseInt(existing.value) || 0) + (parseInt(act.value) || 0);
          else tgt.actions.push({ ...act });
        }
      }
      if (hD && !hourlyData) hourlyData = hD;  // first non-empty hourly wins
    });
    // Convert daily aggregator back to segmented format
    const dailyData = { segmented_metrics: Object.entries(dailyAggregator).sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ period: date, metrics: v.metrics })) };

    // Parse campaigns
    const camps = campList.map(c => {
      const ac = c.actions || [];
      return {
        account: c._account,
        id: c.campaign_id,
        name: c.campaign_name,
        spend: parseFloat(c.spend || 0),
        impressions: parseInt(c.impressions || 0),
        clicks: parseInt(c.clicks || 0),
        reach: parseInt(c.reach || 0),
        ctr: parseFloat(c.ctr || 0),
        cpc: parseFloat(c.cpc || 0),
        cpm: parseFloat(c.cpm || 0),
        status: c.effective_status || c.campaign_status || '?',
        msgs: xA(ac, 'onsite_conversion.messaging_first_reply'),
        connections: xA(ac, 'onsite_conversion.total_messaging_connection'),
        depth2: xA(ac, 'onsite_conversion.messaging_user_depth_2_message_send'),
        depth3: xA(ac, 'onsite_conversion.messaging_user_depth_3_message_send'),
        depth5: xA(ac, 'onsite_conversion.messaging_user_depth_5_message_send')
      };
    });

    // Parse ads with messaging depth
    const ads = adsList.map(a => {
      const ac = a.actions || [];
      const connections = xA(ac, 'onsite_conversion.total_messaging_connection');
      const firstReply = xA(ac, 'onsite_conversion.messaging_first_reply');
      const depth2 = xA(ac, 'onsite_conversion.messaging_user_depth_2_message_send');
      const depth3 = xA(ac, 'onsite_conversion.messaging_user_depth_3_message_send');
      const depth5 = xA(ac, 'onsite_conversion.messaging_user_depth_5_message_send');
      const spend = parseFloat(a.spend || 0);
      return {
        account: a._account,
        id: a.ad_id,
        name: a.ad_name,
        adsetId: a.adset_id,           // ← ABO/CBO decisions need this
        adsetName: a.adset_name,
        campName: a.campaign_name,
        campId: a.campaign_id,
        spend,
        impressions: parseInt(a.impressions || 0),
        clicks: parseInt(a.clicks || 0),
        reach: parseInt(a.reach || 0),
        ctr: parseFloat(a.ctr || 0),
        cpc: parseFloat(a.cpc || 0),
        cpm: parseFloat(a.cpm || 0),
        status: a.effective_status || '?',
        // Messaging depth
        connections,
        firstReply,
        depth2,
        depth3,
        depth5,
        costPerReply: firstReply > 0 ? spend / firstReply : null,
        costPer5Msg: depth5 > 0 ? spend / depth5 : null,
        replyRate: connections > 0 ? (firstReply / connections * 100) : 0,
        depthRate: connections > 0 ? (depth5 / connections * 100) : 0
      };
    }).sort((a, b) => b.spend - a.spend);

    // Parse daily (segmented_metrics format from Pipeboard)
    const days = [];
    const segmented = dailyData?.segmented_metrics || dailyData?.data || (Array.isArray(dailyData) ? dailyData : []);
    for (const seg of segmented) {
      const m = seg.metrics || seg;
      const ac = m.actions || [];
      days.push({
        date: seg.period || seg.date_start || m.date_start,
        spend: parseFloat(m.spend || 0),
        impressions: parseInt(m.impressions || 0),
        clicks: parseInt(m.clicks || 0),
        reach: parseInt(m.reach || 0),
        msgs: xA(ac, 'onsite_conversion.messaging_first_reply'),
        connections: xA(ac, 'onsite_conversion.total_messaging_connection'),
        depth2: xA(ac, 'onsite_conversion.messaging_user_depth_2_message_send'),
        depth3: xA(ac, 'onsite_conversion.messaging_user_depth_3_message_send'),
        depth5: xA(ac, 'onsite_conversion.messaging_user_depth_5_message_send')
      });
    }

    // Totals
    const tSpend = camps.reduce((s, c) => s + c.spend, 0);
    const tMsgs = camps.reduce((s, c) => s + c.msgs, 0);
    const tClicks = camps.reduce((s, c) => s + c.clicks, 0);
    const tImps = camps.reduce((s, c) => s + c.impressions, 0);
    const tReach = camps.reduce((s, c) => s + c.reach, 0);
    const avgCPR = tMsgs > 0 ? tSpend / tMsgs : 999;
    const bCTR = tImps > 0 ? (tClicks / tImps * 100) : 0;
    const bCPM = tImps > 0 ? (tSpend / tImps * 1000) : 0;

    // Verdicts
    const verdict = (c) => {
      const msgs = c.msgs;
      if (!msgs || msgs < 1) {
        if (c.spend > 100) return { label: 'PAUSE', cls: 'dec', r: 'High spend, near-zero replies' };
        if (c.ctr > 5) return { label: 'TEST MSG', cls: 'test', r: 'Strong engagement — test messaging objective' };
        return { label: 'MONITOR', cls: 'mon', r: 'Insufficient data' };
      }
      const cpr = c.spend / msgs;
      if (c.status === 'PAUSED' && cpr < avgCPR) return { label: 'REACTIVATE', cls: 'inc', r: `Was efficient at $${cpr.toFixed(2)}/reply` };
      if (cpr < avgCPR * 0.75 && msgs >= 15) return { label: '\u2191 SCALE', cls: 'inc', r: `Top performer at $${cpr.toFixed(2)}/reply` };
      if (cpr > avgCPR * 3) return { label: '\u2193 CUT', cls: 'dec', r: `$${cpr.toFixed(2)}/reply is ${(cpr/avgCPR).toFixed(1)}\u00D7 avg` };
      if (cpr > avgCPR * 1.5) return { label: 'REDUCE', cls: 'dec', r: `Above avg at $${cpr.toFixed(2)}/reply` };
      if (c.spend < 50 && c.ctr > 5) return { label: 'TEST', cls: 'test', r: 'Strong early signals' };
      return { label: 'STEADY', cls: 'mon', r: `On track at $${cpr.toFixed(2)}/reply` };
    };
    camps.forEach(c => { c.verdict = verdict(c); });
    camps.sort((a, b) => {
      const ac = a.msgs > 0 ? a.spend / a.msgs : 9999;
      const bc = b.msgs > 0 ? b.spend / b.msgs : 9999;
      return ac - bc;
    });

    // DOW — rich weekday analysis
    const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dow = {};
    DOW.forEach(d => { dow[d] = { spend: 0, clicks: 0, impressions: 0, msgs: 0, connections: 0, depth2: 0, depth5: 0, count: 0, dates: [] }; });
    days.forEach(d => {
      if (!d.spend && !d.clicks) return;
      const dn = DOW[new Date(d.date + 'T12:00:00').getDay()];
      dow[dn].spend += d.spend;
      dow[dn].clicks += d.clicks;
      dow[dn].impressions += d.impressions;
      dow[dn].msgs += d.msgs;
      dow[dn].connections += d.connections;
      dow[dn].depth2 += d.depth2;
      dow[dn].depth5 += d.depth5;
      dow[dn].count++;
      dow[dn].dates.push(d.date);
    });

    // Simple sorted list (kept for backward compat with old DOW tab)
    const dowS = DOW.map(n => {
      const d = dow[n];
      if (!d.count) return null;
      return { day: n, avgSpend: d.spend / d.count, avgMsgs: d.msgs / d.count, cpr: d.msgs > 0 ? d.spend / d.msgs : null };
    }).filter(Boolean).sort((a, b) => (a.cpr || 999) - (b.cpr || 999));

    // Rich weekday breakdown for "Best Days" tab
    const wdRows = DOW.map(n => {
      const d = dow[n];
      if (!d.count) return { day: n, weeks: 0, noData: true };
      const cpr = d.msgs > 0 ? d.spend / d.msgs : null;
      const replyRate = d.connections > 0 ? (d.msgs / d.connections * 100) : 0;
      const depthRate = d.connections > 0 ? (d.depth5 / d.connections * 100) : 0;
      return {
        day: n,
        weeks: d.count,
        totalSpend: d.spend,
        totalMsgs: d.msgs,
        totalConnections: d.connections,
        avgSpend: d.spend / d.count,
        avgMsgs: d.msgs / d.count,
        avgClicks: d.clicks / d.count,
        avgConnections: d.connections / d.count,
        cpr,
        replyRate,
        depthRate
      };
    });

    // Period-wide averages (only days with msgs) for scoring
    const valid = wdRows.filter(w => !w.noData && w.cpr != null);
    const periodAvgCPR = valid.length ? valid.reduce((s, w) => s + w.cpr, 0) / valid.length : null;
    const periodAvgMsgs = valid.length ? valid.reduce((s, w) => s + w.avgMsgs, 0) / valid.length : 0;

    // Score each weekday & assign action
    wdRows.forEach(w => {
      if (w.noData || w.cpr == null) { w.action = 'NO DATA'; w.actionCls = 'mon'; w.score = 0; return; }
      // Lower CPR = better. Score 0-100 relative to best/worst
      const cprs = valid.map(v => v.cpr);
      const minC = Math.min(...cprs), maxC = Math.max(...cprs);
      w.score = maxC === minC ? 100 : Math.round((1 - (w.cpr - minC) / (maxC - minC)) * 100);
      if (periodAvgCPR && w.cpr <= periodAvgCPR * 0.8 && w.avgMsgs >= periodAvgMsgs * 0.8) {
        w.action = 'SCALE ↑'; w.actionCls = 'inc'; w.rec = `Best day — invest more. $${w.cpr.toFixed(2)}/reply`;
      } else if (periodAvgCPR && w.cpr >= periodAvgCPR * 1.5) {
        w.action = 'PAUSE'; w.actionCls = 'dec'; w.rec = `Expensive day — pause or reduce. $${w.cpr.toFixed(2)}/reply`;
      } else if (periodAvgCPR && w.cpr >= periodAvgCPR * 1.15) {
        w.action = 'REDUCE'; w.actionCls = 'dec'; w.rec = `Above average — lower budget`;
      } else {
        w.action = 'KEEP'; w.actionCls = 'mon'; w.rec = `In line with average`;
      }
    });

    // Rank best→worst by CPR
    const ranked = [...valid].sort((a, b) => a.cpr - b.cpr);
    const bestDays = ranked.slice(0, 3).map(w => w.day);
    const worstDays = ranked.slice(-2).map(w => w.day);

    // Budget reallocation suggestion: shift % from worst to best
    const totalWeekdaySpend = valid.reduce((s, w) => s + w.totalSpend, 0);
    const budgetPlan = wdRows.map(w => {
      if (w.noData || w.cpr == null) return { day: w.day, current: 0, suggested: 0, change: 0 };
      // Weight inversely by CPR (cheaper day gets more budget)
      const invCpr = 1 / w.cpr;
      return { day: w.day, _inv: invCpr, current: w.totalSpend };
    });
    const totalInv = budgetPlan.reduce((s, b) => s + (b._inv || 0), 0);
    budgetPlan.forEach(b => {
      if (!b._inv) { b.suggested = 0; b.change = 0; return; }
      b.suggested = Math.round((b._inv / totalInv) * totalWeekdaySpend);
      b.change = b.suggested - b.current;
      delete b._inv;
    });

    const dowRich = {
      rows: wdRows,
      periodAvgCPR,
      bestDays,
      worstDays,
      budgetPlan,
      lookbackDays: days.filter(d => d.spend > 0).length
    };

    // Funnel
    const funnel = {
      connections: days.reduce((s, d) => s + d.connections, 0),
      firstReply: days.reduce((s, d) => s + d.msgs, 0),
      depth2: days.reduce((s, d) => s + d.depth2, 0),
      depth3: days.reduce((s, d) => s + d.depth3, 0),
      depth5: days.reduce((s, d) => s + d.depth5, 0)
    };

    // Weekly
    const weeks = {};
    days.forEach(d => {
      if (!d.spend) return;
      const dt = new Date(d.date + 'T12:00:00');
      const ws = new Date(dt);
      ws.setDate(dt.getDate() - dt.getDay() + 1);
      const k = ws.toISOString().split('T')[0];
      if (!weeks[k]) weeks[k] = { start: k, spend: 0, clicks: 0, msgs: 0 };
      weeks[k].spend += d.spend;
      weeks[k].clicks += d.clicks;
      weeks[k].msgs += d.msgs;
    });
    const weekly = Object.values(weeks).sort((a, b) => a.start.localeCompare(b.start));

    // ─── HOUR-OF-DAY ANALYSIS ───
    let hourRich = null;
    try {
      const hRows = hourlyData?.segmented_metrics || hourlyData?.data || (Array.isArray(hourlyData) ? hourlyData : []);
      if (hRows && hRows.length) {
        const hours = {}; // 0-23 → totals
        for (let h = 0; h < 24; h++) hours[h] = { spend: 0, clicks: 0, impressions: 0, msgs: 0, connections: 0 };
        for (const seg of hRows) {
          const m = seg.metrics || seg;
          const hourStr = seg.hourly_stats_aggregated_by_advertiser_time_zone
            || m.hourly_stats_aggregated_by_advertiser_time_zone
            || seg.breakdown_value || seg.hour;
          if (hourStr == null) continue;
          const hh = parseInt(String(hourStr).split(':')[0].trim());
          if (isNaN(hh) || hh < 0 || hh > 23) continue;
          const ac = m.actions || [];
          hours[hh].spend += parseFloat(m.spend || 0);
          hours[hh].clicks += parseInt(m.clicks || 0);
          hours[hh].impressions += parseInt(m.impressions || 0);
          hours[hh].msgs += xA(ac, 'onsite_conversion.messaging_first_reply');
          hours[hh].connections += xA(ac, 'onsite_conversion.total_messaging_connection');
        }
        const hourRows = [];
        for (let h = 0; h < 24; h++) {
          const d = hours[h];
          const has = d.spend > 0 || d.clicks > 0 || d.msgs > 0;
          hourRows.push({
            hour: h,
            label: `${String(h).padStart(2,'0')}:00`,
            spend: d.spend, clicks: d.clicks, impressions: d.impressions,
            msgs: d.msgs, connections: d.connections,
            cpr: d.msgs > 0 ? d.spend / d.msgs : null,
            replyRate: d.connections > 0 ? d.msgs / d.connections * 100 : 0,
            hasData: has
          });
        }
        const validH = hourRows.filter(r => r.cpr != null);
        const avgH = validH.length ? validH.reduce((s, r) => s + r.cpr, 0) / validH.length : null;
        const cprs = validH.map(r => r.cpr);
        const minC = cprs.length ? Math.min(...cprs) : 0;
        const maxC = cprs.length ? Math.max(...cprs) : 1;
        hourRows.forEach(r => {
          if (r.cpr == null) { r.score = 0; r.tier = r.hasData ? 'weak' : 'none'; return; }
          r.score = maxC === minC ? 100 : Math.round((1 - (r.cpr - minC) / (maxC - minC)) * 100);
          if (avgH && r.cpr <= avgH * 0.8) r.tier = 'prime';
          else if (avgH && r.cpr >= avgH * 1.5) r.tier = 'dead';
          else if (avgH && r.cpr >= avgH * 1.15) r.tier = 'weak';
          else r.tier = 'ok';
        });
        const ranked = [...validH].sort((a, b) => a.cpr - b.cpr);
        // Suggested on/off windows: contiguous hours that are prime/ok
        const onHours = hourRows.filter(r => r.tier === 'prime' || r.tier === 'ok').map(r => r.hour).sort((a,b)=>a-b);
        const offHours = hourRows.filter(r => r.tier === 'dead' || (r.tier === 'none')).map(r => r.hour).sort((a,b)=>a-b);
        hourRich = {
          rows: hourRows,
          avgCPR: avgH,
          bestHours: ranked.slice(0, 4).map(r => r.label),
          worstHours: ranked.slice(-4).map(r => r.label),
          onHours, offHours,
          dataDays: days.filter(d => d.spend > 0).length
        };
      }
    } catch (e) { console.error('Hourly parse error:', e.message); }

    const fetchTime = ((Date.now() - t0) / 1000).toFixed(1);

    res.json({
      period: { sd: dateFrom, ed: dateTo },
      camps, ads, days, dowS, dowRich, hourRich, funnel, weekly,
      totals: { tSpend, tMsgs, tClicks, tImps, tReach, avgCPR, bCTR, bCPM },
      fetchTime
    });
  } catch (e) {
    console.error('Analytics error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Campaigns ---
app.get('/api/campaigns', (req, res) => {
  res.json(all(`SELECT c.*,
    COALESCE((SELECT SUM(spend) FROM insights_daily WHERE campaign_meta_id = c.meta_id), 0) as total_spend,
    COALESCE((SELECT SUM(clicks) FROM insights_daily WHERE campaign_meta_id = c.meta_id), 0) as total_clicks,
    COALESCE((SELECT SUM(link_clicks) FROM insights_daily WHERE campaign_meta_id = c.meta_id), 0) as total_link_clicks,
    COALESCE((SELECT SUM(impressions) FROM insights_daily WHERE campaign_meta_id = c.meta_id), 0) as total_impressions,
    COALESCE((SELECT AVG(ctr) FROM insights_daily WHERE campaign_meta_id = c.meta_id), 0) as avg_ctr,
    COALESCE((SELECT AVG(cpc) FROM insights_daily WHERE campaign_meta_id = c.meta_id AND cpc > 0), 0) as avg_cpc,
    COALESCE((SELECT AVG(frequency) FROM insights_daily WHERE campaign_meta_id = c.meta_id), 0) as avg_frequency
    FROM campaigns c ORDER BY total_spend DESC`));
});

app.get('/api/campaigns/:metaId', (req, res) => {
  const campaign = get('SELECT * FROM campaigns WHERE meta_id = ?', [req.params.metaId]);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  const insights = all('SELECT * FROM insights_daily WHERE campaign_meta_id = ? ORDER BY date DESC', [req.params.metaId]);
  res.json({ ...campaign, insights });
});

app.patch('/api/campaigns/:metaId', async (req, res) => {
  const { status, ai_label, category } = req.body;
  if (status) {
    await mcpCall('update_campaign', { campaign_id: req.params.metaId, status });
    run('UPDATE campaigns SET status = ?, updated_at = datetime("now") WHERE meta_id = ?', [status, req.params.metaId]);
  }
  if (ai_label) run('UPDATE campaigns SET ai_label = ?, updated_at = datetime("now") WHERE meta_id = ?', [ai_label, req.params.metaId]);
  if (category) run('UPDATE campaigns SET category = ?, updated_at = datetime("now") WHERE meta_id = ?', [category, req.params.metaId]);
  res.json({ ok: true });
});

// --- Ad Sets ---
app.get('/api/adsets', (req, res) => {
  const { campaign_id } = req.query;
  let query = `SELECT a.*,
    COALESCE((SELECT SUM(spend) FROM insights_daily WHERE adset_meta_id = a.meta_id), 0) as total_spend,
    COALESCE((SELECT SUM(clicks) FROM insights_daily WHERE adset_meta_id = a.meta_id), 0) as total_clicks,
    COALESCE((SELECT AVG(ctr) FROM insights_daily WHERE adset_meta_id = a.meta_id), 0) as avg_ctr
    FROM adsets a`;
  const params = [];
  if (campaign_id) { query += ' WHERE a.campaign_meta_id = ?'; params.push(campaign_id); }
  query += ' ORDER BY total_spend DESC';
  res.json(all(query, params));
});

app.patch('/api/adsets/:metaId', async (req, res) => {
  const { status } = req.body;
  if (status) {
    await mcpCall('update_adset', { adset_id: req.params.metaId, status });
    run('UPDATE adsets SET status = ?, updated_at = datetime("now") WHERE meta_id = ?', [status, req.params.metaId]);
  }
  res.json({ ok: true });
});

// ─── PHASE 2: AD SCHEDULING (dayparting) ───

// List live ad sets from Meta with budget info
app.get('/api/live-adsets', async (req, res) => {
  try {
    const raw = extractText(await mcpCall('get_adsets', { account_id: AD_ACCOUNT_ID }));
    const list = raw?.data || (Array.isArray(raw) ? raw : []);
    const out = list.map(a => ({
      id: a.id,
      name: a.name,
      campaign_id: a.campaign_id,
      status: a.effective_status || a.status,
      daily_budget: a.daily_budget ? parseInt(a.daily_budget) / 100 : null,
      lifetime_budget: a.lifetime_budget ? parseInt(a.lifetime_budget) / 100 : null,
      budget_type: a.lifetime_budget && parseInt(a.lifetime_budget) > 0 ? 'lifetime' : 'daily',
      has_schedule: !!(a.adset_schedule && a.adset_schedule.length),
      end_time: a.end_time || null
    }));
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Convert on-hours array → Meta adset_schedule blocks
function buildSchedule(onHours, days) {
  const s = [...new Set(onHours)].filter(h => h >= 0 && h <= 23).sort((a, b) => a - b);
  if (!s.length) return [];
  const blocks = [];
  let start = s[0], prev = s[0];
  for (let i = 1; i < s.length; i++) {
    if (s[i] === prev + 1) { prev = s[i]; continue; }
    blocks.push([start, prev]); start = s[i]; prev = s[i];
  }
  blocks.push([start, prev]);
  // Meta: start_minute/end_minute = minutes from midnight; end is exclusive boundary
  return blocks.map(([a, b]) => ({
    start_minute: a * 60,
    end_minute: (b + 1) * 60,   // hour boundary; 24→1440 = midnight
    days: days && days.length ? days : [0, 1, 2, 3, 4, 5, 6]
  }));
}

// Apply dayparting schedule to an ad set (switches to lifetime budget)
app.post('/api/apply-schedule', async (req, res) => {
  const { adset_id, on_hours, days, lifetime_budget, end_time } = req.body;
  if (!adset_id) return res.status(400).json({ error: 'adset_id required' });
  if (!on_hours || !on_hours.length) return res.status(400).json({ error: 'on_hours required' });
  if (!lifetime_budget || lifetime_budget < 1) return res.status(400).json({ error: 'lifetime_budget required (USD)' });
  if (!end_time) return res.status(400).json({ error: 'end_time required (YYYY-MM-DD)' });

  const schedule = buildSchedule(on_hours, days);
  try {
    const args = {
      adset_id,
      lifetime_budget: Math.round(lifetime_budget * 100),   // cents
      daily_budget: 0,                                       // clear daily
      end_time: `${end_time}T23:59:00-0600`,                 // account TZ approx
      pacing_type: ['day_parting'],
      adset_schedule: schedule
    };
    const result = extractText(await mcpCall('update_adset', args));
    res.json({ ok: true, applied_schedule: schedule, meta_response: result });
  } catch (e) {
    res.status(500).json({ error: e.message, attempted_schedule: schedule });
  }
});

// Duplicate an existing ad set as a NEW lifetime-budget ad set WITH a daypart schedule.
// Original is left untouched. New ad set + cloned ads are created PAUSED for user review.
app.post('/api/duplicate-with-schedule', async (req, res) => {
  const { adset_id, on_hours, days, lifetime_budget, end_time } = req.body;
  if (!adset_id) return res.status(400).json({ error: 'adset_id required' });
  if (!on_hours || !on_hours.length) return res.status(400).json({ error: 'on_hours required' });
  if (!lifetime_budget || lifetime_budget < 1) return res.status(400).json({ error: 'lifetime_budget required (USD)' });
  if (!end_time) return res.status(400).json({ error: 'end_time required (YYYY-MM-DD)' });

  const schedule = buildSchedule(on_hours, days);
  const steps = [];
  try {
    // 1. Read original ad set
    const orig = extractText(await mcpCall('get_adset_details', { adset_id }));
    if (!orig || orig.error) return res.status(500).json({ error: 'Could not read source ad set', detail: orig });
    steps.push(`Read source ad set "${orig.name}"`);

    const campaignId = orig.campaign_id;
    const newName = `${orig.name} [Scheduled]`;

    // 2. Create the new ad set: lifetime budget + dayparting + copied targeting, PAUSED
    const createArgs = {
      account_id: AD_ACCOUNT_ID,
      campaign_id: campaignId,
      name: newName,
      status: 'PAUSED',
      lifetime_budget: Math.round(lifetime_budget * 100),
      end_time: `${end_time}T23:59:00-0600`,
      pacing_type: ['day_parting'],
      adset_schedule: schedule,
      billing_event: orig.billing_event || 'IMPRESSIONS',
      optimization_goal: orig.optimization_goal || 'CONVERSATIONS',
      targeting: orig.targeting || undefined,
      promoted_object: orig.promoted_object || undefined,
      destination_type: orig.destination_type || undefined,
      bid_strategy: orig.bid_strategy || 'LOWEST_COST_WITHOUT_CAP'
    };
    const newAdset = extractText(await mcpCall('create_adset', createArgs));
    const newAdsetId = newAdset?.id || newAdset?.adset_id;
    if (!newAdsetId) return res.status(500).json({ error: 'Failed to create scheduled ad set', detail: newAdset, steps });
    steps.push(`Created new ad set ${newAdsetId} (lifetime $${lifetime_budget}, PAUSED)`);

    // 2b. Meta IGNORES adset_schedule on creation — must be set via a follow-up
    //     update once the ad set exists with a lifetime budget. Apply + verify.
    let scheduleApplied = false, scheduleError = null;
    try {
      const upd = extractText(await mcpCall('update_adset', {
        adset_id: newAdsetId,
        pacing_type: ['day_parting'],
        adset_schedule: schedule
      }));
      // NOTE: get_adset_details does NOT return the adset_schedule field, so we
      // can't read the grid back. Verify via update success + pacing_type flip
      // to 'day_parting' (which IS returned) — that proves the call took effect.
      const updOk = upd && (upd.success === true || (!upd.error && !upd.isError));
      const chk = extractText(await mcpCall('get_adset_details', { adset_id: newAdsetId }));
      const pacing = chk && chk.pacing_type;
      const dayparting = Array.isArray(pacing) && pacing.includes('day_parting');
      scheduleApplied = !!(updOk && dayparting);
      if (!scheduleApplied) scheduleError = (upd && (upd.error || upd.isError)) ? JSON.stringify(upd.error || upd) : 'pacing_type did not switch to day_parting';
      steps.push(scheduleApplied
        ? `Applied dayparting schedule (${schedule.length} block(s)); update success + pacing_type=day_parting confirmed`
        : `WARNING: schedule did not stick — ${scheduleError}`);
    } catch (e) {
      scheduleError = e.message;
      steps.push(`WARNING: schedule update failed — ${e.message}`);
    }

    // 3. Clone each ad (reuse existing creative → keeps post + social proof)
    const adsRaw = extractText(await mcpCall('get_ads', { account_id: AD_ACCOUNT_ID, adset_id }));
    const ads = adsRaw?.data || (Array.isArray(adsRaw) ? adsRaw : []);
    const adResults = [];
    for (const ad of ads) {
      try {
        const det = extractText(await mcpCall('get_ad_details', { ad_id: ad.id }));
        const creativeId = det?.creative?.id || ad?.creative?.id;
        if (!creativeId) { adResults.push({ name: ad.name, error: 'no creative id' }); continue; }
        const newAd = extractText(await mcpCall('create_ad', {
          account_id: AD_ACCOUNT_ID,
          adset_id: newAdsetId,
          name: ad.name,
          status: 'PAUSED',
          creative_id: creativeId
        }));
        if (newAd?.id) adResults.push({ name: ad.name, id: newAd.id });
        else adResults.push({ name: ad.name, error: JSON.stringify(newAd).slice(0, 120) });
      } catch (e) { adResults.push({ name: ad.name, error: e.message }); }
    }
    steps.push(`Cloned ${adResults.filter(a => a.id).length}/${ads.length} ads`);

    res.json({
      ok: true,
      original_adset: { id: adset_id, name: orig.name, untouched: true },
      new_adset: { id: newAdsetId, name: newName, status: 'PAUSED', lifetime_budget, end_time },
      schedule, schedule_applied: scheduleApplied, schedule_error: scheduleError, ads: adResults, steps
    });
  } catch (e) {
    res.status(500).json({ error: e.message, steps });
  }
});

// Repair: apply (or replace) a dayparting schedule on an EXISTING lifetime ad set.
// No budget changes — only pacing_type + adset_schedule. Verifies it stuck on Meta.
app.post('/api/repair-schedule', async (req, res) => {
  const { adset_id, on_hours, days } = req.body;
  if (!adset_id) return res.status(400).json({ error: 'adset_id required' });
  if (!on_hours || !on_hours.length) return res.status(400).json({ error: 'on_hours required' });
  const schedule = buildSchedule(on_hours, days);
  try {
    const upd = extractText(await mcpCall('update_adset', {
      adset_id, pacing_type: ['day_parting'], adset_schedule: schedule
    }));
    const updOk = upd && (upd.success === true || (!upd.error && !upd.isError));
    const chk = extractText(await mcpCall('get_adset_details', { adset_id }));
    const pacing = chk && chk.pacing_type;
    const applied = !!(updOk && Array.isArray(pacing) && pacing.includes('day_parting'));
    res.json({
      ok: applied, adset_id, name: chk?.name, schedule,
      pacing_type: pacing || null,
      note: 'adset_schedule is not readable via the API client; verified via update success + pacing_type=day_parting. Confirm the grid visually in Ads Manager.',
      error: applied ? null : ((upd && (upd.error || upd.isError)) ? JSON.stringify(upd.error || upd) : 'pacing_type did not switch to day_parting')
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, attempted_schedule: schedule });
  }
});

// ─── CREATE CAMPAIGN + AD SET — DIRECT META GRAPH API ───
// User picks audience archetype + budget + objective → wizard provisions a fresh
// Campaign + AdSet in Meta, PAUSED for review. Ads attached separately via the
// Promote IG wizard or manually in Ads Manager.
const ARCHETYPE_PRESETS = {
  wholesale_mixcalco_50mi: {
    label: 'Wholesale — Mixcalco (CDMX 50mi radius)',
    geo_locations: { custom_locations: [{ latitude: 19.435, longitude: -99.126, radius: 50, distance_unit: 'mile', name: 'Mixcalco 50mi' }], location_types: ['home', 'recent'] },
    suggested_daily_usd: 35,
    note: 'Best for B2B wholesale buyers travelling to CDMX. 32× ROAS pattern.'
  },
  wholesale_mixcalco_40mi: {
    label: 'Wholesale — Mixcalco (CDMX 40mi radius)',
    geo_locations: { custom_locations: [{ latitude: 19.435, longitude: -99.126, radius: 40, distance_unit: 'mile', name: 'Mixcalco 40mi' }], location_types: ['home', 'recent'] },
    suggested_daily_usd: 30,
    note: 'Tighter Mixcalco radius. Use if 50mi is too broad.'
  },
  beach_13_cities: {
    label: 'Beach — 13 coastal cities (the proven Sahiba beach mix)',
    geo_locations: {
      // VERIFIED city_key values pulled from BEACH-Bata70Pesos-13PlayaCities-Jun26
      // (the existing working ad set) on 2026-06-20. DO NOT MAKE UP KEYS —
      // Meta accepts any numeric key without complaint but resolves it to whatever
      // city happens to have that ID, even in Colorado USA or Maharashtra India.
      // To add a new city: search via the search_geo_locations Pipeboard MCP tool
      // OR Graph API /search?type=adgeolocation&q=<name>&access_token=<TOK>.
      cities: [
        { key: '1508006', name: 'Cancún',           radius: 15, distance_unit: 'mile', country: 'MX' },
        { key: '1509864', name: 'Chetumal',         radius: 25, distance_unit: 'mile', country: 'MX' },
        { key: '1524168', name: 'Isla Mujeres',     radius: 10, distance_unit: 'mile', country: 'MX' },
        { key: '1535012', name: 'Mazatlán',         radius: 10, distance_unit: 'mile', country: 'MX' },
        { key: '1535184', name: 'Mérida',           radius: 15, distance_unit: 'mile', country: 'MX' },
        { key: '1536972', name: 'Nayar',            radius: 15, distance_unit: 'mile', country: 'MX' },
        { key: '1540930', name: 'Playa del Carmen', radius: 10, distance_unit: 'mile', country: 'MX' },
        { key: '1542382', name: 'Puerto Vallarta',  radius: 15, distance_unit: 'mile', country: 'MX' },
        { key: '1542444', name: 'Punta de Mita',    radius: 10, distance_unit: 'mile', country: 'MX' },
        { key: '1553756', name: 'Sayulita',         radius: 10, distance_unit: 'mile', country: 'MX' },
        { key: '1558246', name: 'Tulum',            radius: 10, distance_unit: 'mile', country: 'MX' },
        { key: '1559085', name: 'Veracruz',         radius: 10, distance_unit: 'mile', country: 'MX' },
        { key: '1559693', name: 'Xalapa',           radius: 10, distance_unit: 'mile', country: 'MX' }
      ],
      location_types: ['home', 'recent']
    },
    suggested_daily_usd: 30,
    note: 'Proven beach-cities audience. Used by your top 3 BEACH ad sets.'
  },
  scale_states: {
    label: 'SCALE States — Aguascalientes + Campeche + Michoacán + Nayarit',
    geo_locations: {
      regions: [
        { key: '2505', name: 'Aguascalientes', country: 'MX' },
        { key: '2508', name: 'Campeche', country: 'MX' },
        { key: '2520', name: 'Michoacán de Ocampo', country: 'MX' },
        { key: '2522', name: 'Nayarit', country: 'MX' }
      ],
      location_types: ['home', 'recent']
    },
    suggested_daily_usd: 20,
    note: 'Discovery test pool — 4 highest USD/lead states from Geo ROI analysis.'
  },
  custom: { label: 'Custom — I define geo manually below', geo_locations: null, suggested_daily_usd: 15, note: 'Use when none of the presets fit.' }
};

app.get('/api/campaign-presets', (req, res) => {
  res.json(Object.entries(ARCHETYPE_PRESETS).map(([k, v]) => ({
    key: k, label: v.label, suggested_daily_usd: v.suggested_daily_usd, note: v.note,
    summary: v.geo_locations ? (v.geo_locations.custom_locations ? `${v.geo_locations.custom_locations.length} custom location(s)` : v.geo_locations.cities ? `${v.geo_locations.cities.length} cities` : v.geo_locations.regions ? `${v.geo_locations.regions.length} regions` : 'no geo') : 'custom'
  })));
});

// ─── TIKTOK SUMMARY ───
// Pulls advertiser info + campaigns + last-N-days spend for SAHIBA's TikTok ad account
// via Pipeboard's TikTok MCP. Read-only. Foundation for the 🎵 TikTok dashboard tab.
app.get('/api/tiktok-summary', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const advId = setting('tiktok_advertiser_id');
    if (!advId) return res.status(400).json({ error: 'tiktok_advertiser_id not set in CRM settings' });
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // Parallel calls — advertiser info + campaigns + spend
    const [info, campsRaw, spend] = await Promise.allSettled([
      tiktokCall('get_tiktok_advertiser_info', { advertiser_id: advId }),
      tiktokCall('get_tiktok_campaigns', { advertiser_id: advId }),
      tiktokCall('get_tiktok_insights', {
        advertiser_id: advId, data_level: 'AUCTION_ADVERTISER', report_type: 'BASIC',
        metrics: ['spend', 'impressions', 'clicks', 'conversion', 'cpc', 'cpm', 'ctr'],
        start_date: start, end_date: end
      })
    ]);

    const adv = info.status === 'fulfilled' ? (info.value?.advertiser || info.value) : null;
    const campaigns = campsRaw.status === 'fulfilled' ? (campsRaw.value?.campaigns || campsRaw.value?.list || campsRaw.value?.data || []) : [];
    const insights = spend.status === 'fulfilled' ? (spend.value?.metrics || spend.value?.list || []) : [];
    const totalSpend = insights.reduce((a, r) => a + (parseFloat(r.spend || r.metrics?.spend) || 0), 0);

    res.json({
      ok: true,
      window: { days, start_date: start, end_date: end },
      advertiser: adv ? {
        id: adv.advertiser_id, name: adv.name, company: adv.company,
        country: adv.country, currency: adv.currency, timezone: adv.display_timezone,
        status: adv.status, balance: parseFloat(adv.balance || 0),
        account_type: adv.advertiser_account_type,
        business_center_id: adv.owner_bc_id, business_center_name: setting('tiktok_business_center_name', '')
      } : null,
      campaigns: campaigns.map(c => ({
        id: c.campaign_id, name: c.campaign_name, status: c.operation_status || c.status,
        objective: c.objective_type, budget_mode: c.budget_mode, budget: parseFloat(c.budget || 0),
        create_time: c.create_time, modify_time: c.modify_time
      })),
      campaign_count: campaigns.length,
      spend: { total_mxn: totalSpend, currency: adv?.currency || 'MXN' },
      tiktok_shop_voucher_mxn: 57000,   // from user's screenshot — Growth Campus stages
      note: campaigns.length === 0
        ? 'No campaigns yet. Use the New Campaign wizard (coming in Phase 4) or launch your first via Ads Manager.'
        : `${campaigns.length} campaigns over last ${days} days, ${totalSpend.toFixed(2)} ${adv?.currency || 'MXN'} spent.`
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/create-campaign-graph', async (req, res) => {
  const {
    name, archetype, daily_budget_usd, objective, optimization_goal,
    age_min, age_max, dry_run, custom_geo
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!archetype || !ARCHETYPE_PRESETS[archetype]) return res.status(400).json({ error: 'invalid archetype — pick from /api/campaign-presets' });
  if (!daily_budget_usd || daily_budget_usd < 1) return res.status(400).json({ error: 'daily_budget_usd required (USD, >= 1)' });

  const preset = ARCHETYPE_PRESETS[archetype];
  const geoLocations = archetype === 'custom' ? (custom_geo || null) : preset.geo_locations;
  if (!geoLocations) return res.status(400).json({ error: 'custom archetype requires custom_geo in body (object with cities/regions/custom_locations)' });

  const obj = objective || 'OUTCOME_ENGAGEMENT';
  const optGoal = optimization_goal || 'CONVERSATIONS';
  const pageId = setting('page_id') || '514164875351531';
  const waNumber = (setting('whatsapp_link', 'https://wa.me/5215657534707')).replace(/^https?:\/\/wa\.me\//, '');
  const waBusinessPhoneId = setting('whatsapp_business_phone_number_id', '801380323055565');
  const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '').slice(2, 8);
  const adAccountPath = `/act_${AD_ACCOUNT_ID.replace(/^act_/, '')}`;
  const steps = [];

  try {
    const campaignName = `${name.toUpperCase().replace(/[^A-Z0-9_-]/g, '')}-${dateTag}`;
    const adsetName = `${campaignName}-${archetype.toUpperCase()}`;

    let campaignId = null, adsetId = null;

    if (dry_run) {
      steps.push(`DRY-RUN: would create campaign "${campaignName}" (objective=${obj}, status=PAUSED)`);
      steps.push(`DRY-RUN: would create ad set "${adsetName}" (optim=${optGoal}, daily=$${daily_budget_usd}, dest=WHATSAPP)`);
    } else {
      // 1. Create the campaign — Meta requires explicit is_adset_budget_sharing_enabled
      //    on ABO campaigns (where budget is set at ad-set level, not campaign level).
      const camp = await graphCall('POST', `${adAccountPath}/campaigns`, {
        name: campaignName, objective: obj, status: 'PAUSED', special_ad_categories: [],
        is_adset_budget_sharing_enabled: 'false'
      });
      campaignId = camp?.id;
      if (!campaignId) return res.status(500).json({ error: 'campaign create returned no id', detail: camp, steps });
      steps.push(`Created campaign ${campaignId} "${campaignName}"`);

      // 2. Create the ad set inside it. promoted_object MINIMAL — Meta auto-detects
      //    WhatsApp phone from the Page's linked WABA. Adding whatsapp_phone_number
      //    directly causes "phone not linked to account" error (subcode 1487246)
      //    even when it IS linked at the Page level.
      const promotedObject = { page_id: pageId, smart_pse_enabled: false };
      const targeting = {
        age_min: age_min || 25,
        age_max: age_max || 65,
        geo_locations: geoLocations
      };
      const adset = await graphCall('POST', `${adAccountPath}/adsets`, {
        name: adsetName,
        campaign_id: campaignId,
        status: 'PAUSED',
        daily_budget: Math.round(daily_budget_usd * 100),
        billing_event: 'IMPRESSIONS',
        optimization_goal: optGoal,
        destination_type: 'WHATSAPP',
        promoted_object: promotedObject,
        targeting,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP'
      });
      adsetId = adset?.id;
      if (!adsetId) return res.status(500).json({ error: 'adset create returned no id', detail: adset, steps, campaign_id: campaignId });
      steps.push(`Created ad set ${adsetId} "${adsetName}" ($${daily_budget_usd}/day, PAUSED)`);
    }

    res.json({
      ok: true,
      campaign: { id: campaignId, name: campaignName, objective: obj, status: 'PAUSED' },
      adset: { id: adsetId, name: adsetName, daily_budget_usd, optimization_goal: optGoal, destination_type: 'WHATSAPP', archetype },
      preset_summary: preset.note,
      steps,
      note: dry_run
        ? 'DRY-RUN: nothing created on Meta. Re-submit without dry_run to actually provision.'
        : 'Campaign + Ad Set created PAUSED. Now attach an ad via the Promote IG tab (pick this ad set in add_to_existing mode) OR in Meta Ads Manager.'
    });
  } catch (e) {
    res.status(500).json({ error: e.message, steps });
  }
});

// ─── PROMOTE IG POST — DIRECT META GRAPH API ───
// Properly wires Spark Ads with WhatsApp CTA + wa.me link (which Pipeboard's MCP
// can't do due to its 6-parameter cap). Used for add_to_existing mode when the
// target ad set has destination_type=WHATSAPP — which is every Sahiba ad set today.
// Mirrors /api/promote-ig-post but uses Meta Graph API directly.
app.post('/api/promote-ig-post-graph', async (req, res) => {
  const { ig_post, existing_adset_ids, dry_run } = req.body;
  if (!ig_post) return res.status(400).json({ error: 'ig_post (URL or ID) required' });
  if (!existing_adset_ids || !existing_adset_ids.length) return res.status(400).json({ error: 'existing_adset_ids required (at least one target ad set)' });

  const pageId = setting('page_id') || '514164875351531';
  const igUserId = setting('ig_user_id');
  const waNumber = setting('whatsapp_link', 'https://wa.me/5215657534707').replace(/^https?:\/\/wa\.me\//, '');
  const waLink = `https://wa.me/${waNumber}`;
  const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '').slice(2, 8);
  const steps = [];

  try {
    if (!igUserId) return res.status(400).json({ error: 'ig_user_id setting required (Promote IG tab → setup field)', steps });

    // 1. Resolve IG post to media ID — reuse Pipeboard's resolver (already works,
    //    no instagram_basic scope needed on our Graph token).
    const resolved = await resolveIgMedia(ig_post);
    const igMediaId = String(resolved?.media_id || resolved?.id || '');
    if (!igMediaId) return res.status(400).json({ error: 'Could not resolve IG post', detail: resolved, steps });
    steps.push(`Resolved IG post → media_id ${igMediaId}`);

    // 2. Create creative — minimal Spark Ads pattern. The ad set's promoted_object
    //    already specifies WHATSAPP destination + phone, so the creative just needs
    //    to identify the IG media + IG account + Page. Meta wires the CTA automatically
    //    based on the ad set's destination_type.
    const creativeName = `IG${igMediaId.slice(-8)}-${dateTag}-graph`;
    let creativeId = null;
    if (dry_run) {
      steps.push(`DRY-RUN: would create creative "${creativeName}" (Spark Ad, WhatsApp destination inherited from ad set)`);
    } else {
      const cr = await graphCall('POST', `/act_${AD_ACCOUNT_ID.replace(/^act_/, '')}/adcreatives`, {
        name: creativeName,
        source_instagram_media_id: igMediaId,
        instagram_user_id: igUserId
      });
      creativeId = cr?.id;
      if (!creativeId) return res.status(500).json({ error: 'creative create returned no id', detail: cr, steps });
      steps.push(`Created creative ${creativeId}`);
    }

    // 3. For each ad set: create a new ad PAUSED pointing at the new creative
    const results = [];
    for (const adsetId of existing_adset_ids) {
      try {
        const det = await graphCall('GET', `/${adsetId}`, { fields: 'name,destination_type,optimization_goal' });
        const adsetName = det?.name || adsetId;
        const newAdName = `${adsetName}-IG${igMediaId.slice(-6)}-${dateTag}`.slice(0, 100);
        if (dry_run) { results.push({ adset_id: adsetId, adset_name: adsetName, dry_run: true, would_create_ad: newAdName, destination_type: det?.destination_type }); continue; }
        const ad = await graphCall('POST', `/act_${AD_ACCOUNT_ID.replace(/^act_/, '')}/ads`, {
          name: newAdName, status: 'PAUSED', adset_id: adsetId, creative: { creative_id: creativeId }
        });
        results.push({ adset_id: adsetId, adset_name: adsetName, ad_id: ad?.id, ad_name: newAdName, ok: !!ad?.id });
      } catch (e) {
        results.push({ adset_id: adsetId, error: e.message, ok: false });
      }
    }
    const anyFailed = results.some(r => r.ok === false || r.error);
    res.json({
      ok: !anyFailed, mode: 'add_to_existing_graph', ig_media_id: igMediaId, creative_id: creativeId,
      results, steps,
      note: anyFailed
        ? 'One or more ads failed. See each row for the Meta error.'
        : 'New ads created PAUSED inside your existing ad sets with WhatsApp wiring. Review and unpause in Meta Ads Manager.'
    });
  } catch (e) {
    res.status(500).json({ error: e.message, steps });
  }
});

// ─── ONE-CLICK ALERT ACTIONS ───
// Single endpoint that resolves the four routine fixes for Daily Health alerts.
// Every UI button confirms with the user via window.confirm() before calling this.
//   action='pause'      → status=PAUSED
//   action='extend'     → add lifetime budget (cents) + extend end_time by N days
//   action='set_daily'  → set new daily_budget (replaces, in USD)
//   action='resume'     → status=ACTIVE
app.post('/api/adset-action', async (req, res) => {
  const { adset_id, action, add_usd, days, set_daily_usd } = req.body;
  if (!adset_id || !action) return res.status(400).json({ error: 'adset_id + action required' });
  try {
    const args = { adset_id };
    if (action === 'pause') args.status = 'PAUSED';
    else if (action === 'resume') args.status = 'ACTIVE';
    else if (action === 'extend') {
      const cur = extractText(await mcpCall('get_adset_details', { adset_id }));
      if (!cur || cur.error) return res.status(500).json({ error: 'could not read ad set', detail: cur });
      const curLifetime = parseInt(cur.lifetime_budget || 0);
      const addCents = Math.round(parseFloat(add_usd || 350) * 100);
      const dayCount = parseInt(days || 14);
      args.lifetime_budget = curLifetime + addCents;
      args.end_time = new Date(Date.now() + dayCount * 86400000).toISOString().replace(/\.\d+Z$/, '-0600');
    }
    else if (action === 'set_daily') args.daily_budget = Math.round(parseFloat(set_daily_usd || 5) * 100);
    else return res.status(400).json({ error: 'unknown action: ' + action });
    const r = extractText(await mcpCall('update_adset', args));
    // success requires an explicit positive marker — Meta error strings can otherwise pass the
    // lax (!error && !isError) check because extractText returns a string for some failures.
    const rStr = typeof r === 'string' ? r : JSON.stringify(r || {});
    const ok = (r && r.success === true) || /"success"\s*:\s*true/i.test(rStr);
    res.json({ ok, action, adset_id, applied: args, meta_response: r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PROMOTE IG POST WIZARD ───
// Workflow: user pastes IG post URL → wizard creates one PAUSED ad set per city,
// each with creative pointing to the existing IG post. Follows the [TEST]-City-IGpost-Date
// naming convention and uses the user-confirmed conservative budget ($5/day × 14 days
// default). User reviews on Meta and unpauses when ready. NO auto-changes.

// Helper: list campaigns (for the wizard dropdown). Returns campaigns from Meta directly so
// we always have fresh names.
app.get('/api/meta-campaigns', async (req, res) => {
  try {
    const r = extractText(await mcpCall('get_campaigns', { account_id: AD_ACCOUNT_ID }));
    const data = r?.data || (Array.isArray(r) ? r : []);
    res.json(data.filter(c => c.status !== 'DELETED').map(c => ({ id: c.id, name: c.name, status: c.status, objective: c.objective })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helper: resolve a Meta city by name → { key, name, region } (uses first match)
async function resolveCityKey(name) {
  const r = extractText(await mcpCall('search_geo_locations', { query: name, location_types: ['city'], country_code: 'MX' }));
  const data = r?.data || [];
  return data[0] || null;
}

// Helper: resolve IG URL or shortcode to media ID via Pipeboard.
// Requires ig_user_id (Sahiba Instagram Business Account ID) which must be in settings
// because the ad account does not have an auto-linked IG account in Business Manager.
async function resolveIgMedia(input) {
  const trimmed = String(input || '').trim();
  // Already a numeric ID? Use as-is.
  if (/^\d{10,}$/.test(trimmed)) return { media_id: trimmed, source: 'numeric_input' };
  // Extract shortcode from any /p/, /reel/, /tv/ URL (strips query params, trailing slashes)
  const m = trimmed.match(/instagram\.com\/(?:p|reel|tv|reels)\/([A-Za-z0-9_-]+)/);
  const shortcode = m ? m[1] : (/^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null);
  if (!shortcode) throw new Error('Could not parse IG post — paste a full URL like https://www.instagram.com/reel/Cabc123/ or just the shortcode (Cabc123) or the numeric media ID.');
  const igUserId = setting('ig_user_id');
  if (!igUserId) throw new Error('SETUP NEEDED: Instagram Business Account ID is not set. Go to business.facebook.com → Settings → Instagram accounts, copy the numeric ID of the Sahiba IG account, and save it in CRM settings as "ig_user_id".');
  const r = extractText(await mcpCall('resolve_instagram_media', { ig_user_id: igUserId, shortcode }));
  if (!r || r.error) throw new Error('Pipeboard could not resolve shortcode "' + shortcode + '" — ' + (r?.error || 'unknown error') + '. Verify the post is on the Sahiba IG account and that ig_user_id in settings is correct.');
  return { media_id: String(r.media_id || r.id || r.instagram_media_id || ''), source: 'resolved', raw: r };
}

app.post('/api/promote-ig-post', async (req, res) => {
  const { ig_post, cities, daily_budget_usd, days, campaign_id, product_hint, dry_run,
          mode, existing_adset_ids } = req.body;
  if (!ig_post) return res.status(400).json({ error: 'ig_post (URL or ID) required' });
  const promoteMode = mode === 'add_to_existing' ? 'add_to_existing' : 'test';
  if (promoteMode === 'test' && (!cities || !cities.length)) return res.status(400).json({ error: 'at least one city required for test mode' });
  if (promoteMode === 'add_to_existing' && (!existing_adset_ids || !existing_adset_ids.length)) return res.status(400).json({ error: 'at least one existing_adset_ids required for add_to_existing mode' });
  const dailyBudget = parseFloat(daily_budget_usd || 5);
  const window = parseInt(days || 14);
  const lifetimeUSD = Math.round(dailyBudget * window * 100) / 100;       // $70 default
  const endTime = new Date(Date.now() + window * 86400000).toISOString().replace(/\.\d+Z$/, '-0600');
  const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '').slice(2, 8);  // YYMMDD
  const pageId = setting('page_id') || '514164875351531';
  const steps = [];

  try {
    // 1. Resolve IG post → media ID
    const resolved = await resolveIgMedia(ig_post);
    const igMediaId = String(resolved?.media_id || resolved?.id || resolved?.instagram_media_id || '');
    if (!igMediaId) return res.status(400).json({ error: 'Could not resolve IG post — paste full URL or numeric media ID', detail: resolved, steps });
    steps.push(`Resolved IG post → media_id ${igMediaId}`);

    // 2. Check boost eligibility
    let eligibility = null;
    try {
      const elig = extractText(await mcpCall('check_post_boost_eligibility', { post_ids: [igMediaId] }));
      eligibility = elig?.data?.[0] || elig;
      if (eligibility?.eligible === false) return res.status(400).json({ error: 'Post is not boost-eligible on Meta', detail: eligibility, steps });
      steps.push('Post is boost-eligible');
    } catch (e) { steps.push(`Eligibility check skipped: ${e.message}`); }

    // ═══ MODE: add_to_existing — just attach this IG post as a fresh ad to N existing ad sets ═══
    // No new campaign, no new ad set, no budget change. One creative is reused across the ad sets.
    if (promoteMode === 'add_to_existing') {
      steps.push(`Mode: add_to_existing (${existing_adset_ids.length} ad set${existing_adset_ids.length > 1 ? 's' : ''})`);
      const igUserId = setting('ig_user_id');
      if (!igUserId && !dry_run) return res.status(400).json({ error: 'ig_user_id setting required to create IG-post creatives. Set it in the Promote IG tab.', steps });
      let creativeId = null;
      if (!dry_run) {
        const creative = extractText(await mcpCall('create_existing_post_ad_creative', {
          account_id: AD_ACCOUNT_ID, page_id: pageId,
          source_instagram_media_id: igMediaId, instagram_user_id: igUserId,
          name: `IG${igMediaId.slice(-8)}-${dateTag}-creative`
          // NOTE: do NOT pass call_to_action_type when promoting an IG post — Meta
          // inherits the CTA from the post itself and rejects override with "Invalid parameter".
        }));
        // Real Meta creative IDs are 15+ digit numeric strings — reject anything else.
        const rawId = String(creative?.id || creative?.creative_id || '');
        if (!/^\d{12,}$/.test(rawId)) {
          return res.status(500).json({ error: 'creative create failed — no valid creative_id returned', detail: creative, steps });
        }
        creativeId = rawId;
        steps.push(`Created shared creative ${creativeId}`);
      } else { steps.push('DRY-RUN: would create shared creative'); }

      const results = [];
      for (const adsetId of existing_adset_ids) {
        try {
          const det = extractText(await mcpCall('get_adset_details', { adset_id: adsetId }));
          const adsetName = det?.name || adsetId;
          const newAdName = `${adsetName}-IG${igMediaId.slice(-6)}-${dateTag}`.slice(0, 100);
          if (dry_run) { results.push({ adset_id: adsetId, adset_name: adsetName, dry_run: true, would_create_ad: newAdName }); continue; }
          const ad = extractText(await mcpCall('create_ad', {
            account_id: AD_ACCOUNT_ID, adset_id: adsetId, name: newAdName, status: 'PAUSED', creative_id: creativeId
          }));
          if (ad?.id) results.push({ adset_id: adsetId, adset_name: adsetName, ad_id: ad.id, ad_name: newAdName, ok: true });
          else results.push({ adset_id: adsetId, adset_name: adsetName, error: 'ad create failed', detail: ad, ok: false });
        } catch (e) { results.push({ adset_id: adsetId, error: e.message, ok: false }); }
      }
      const anyFailed = results.some(r => r.ok === false || r.error);
      return res.json({
        ok: !anyFailed, mode: 'add_to_existing', ig_media_id: igMediaId, creative_id: creativeId, results, steps,
        note: anyFailed
          ? 'One or more ads failed. See each row for the Meta error. Successful ads (if any) are PAUSED.'
          : 'New ads created PAUSED inside your existing ad sets. Targeting + budget unchanged. Review and unpause in Meta Ads Manager.'
      });
    }

    // ═══ MODE: test — current behaviour, one new ad set per new city ═══
    // 3. Pick or create campaign — skip creation in dry_run (don't litter Meta with empty campaigns)
    let useCampaignId = campaign_id;
    if (!useCampaignId || useCampaignId === 'NEW_TEST') {
      if (dry_run) {
        useCampaignId = 'NEW_TEST (would create on real run)';
        steps.push('DRY-RUN: would create TEST campaign');
      } else {
        const camp = extractText(await mcpCall('create_campaign', {
          account_id: AD_ACCOUNT_ID,
          name: `TEST-NewCities-${dateTag}`,
          objective: 'OUTCOME_ENGAGEMENT',
          status: 'PAUSED',
          special_ad_categories: []
        }));
        useCampaignId = camp?.id || camp?.campaign_id;
        if (!useCampaignId) return res.status(500).json({ error: 'Could not create test campaign', detail: camp, steps });
        steps.push(`Created TEST campaign ${useCampaignId}`);
      }
    }

    // 4. For each city: resolve its key, create ad set + creative + ad (all PAUSED)
    const results = [];
    for (const cityName of cities) {
      const city = await resolveCityKey(cityName);
      if (!city) { results.push({ city: cityName, error: 'city not found on Meta' }); continue; }
      const adsetName = `TEST-${cityName.replace(/[^A-Za-z]/g, '')}-IG${igMediaId.slice(-6)}-${dateTag}`;
      if (dry_run) { results.push({ city: cityName, dry_run: true, would_create: adsetName, city_key: city.key, region: city.region }); continue; }

      // 4a. Create ad set PAUSED with lifetime budget + city geo
      const adset = extractText(await mcpCall('create_adset', {
        account_id: AD_ACCOUNT_ID, campaign_id: useCampaignId, name: adsetName, status: 'PAUSED',
        lifetime_budget: Math.round(lifetimeUSD * 100), end_time: endTime,
        billing_event: 'IMPRESSIONS', optimization_goal: 'CONVERSATIONS',
        targeting: { geo_locations: { cities: [{ key: city.key, radius: 17, distance_unit: 'mile', name: city.name, country: 'MX' }], location_types: ['home', 'recent'] } },
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP'
      }));
      const adsetId = adset?.id || adset?.adset_id;
      if (!adsetId) { results.push({ city: cityName, error: 'adset create failed', detail: adset }); continue; }

      // 4b. Create creative from existing IG post
      // NOTE: do NOT pass call_to_action_type when promoting an IG post — Meta inherits it
      // from the post itself and rejects override with "Invalid parameter".
      const igUserId = setting('ig_user_id');
      const creative = extractText(await mcpCall('create_existing_post_ad_creative', {
        account_id: AD_ACCOUNT_ID, page_id: pageId, source_instagram_media_id: igMediaId,
        instagram_user_id: igUserId,
        name: `${adsetName}-creative`
      }));
      const creativeId = creative?.id || creative?.creative_id;
      if (!creativeId) { results.push({ city: cityName, adset_id: adsetId, error: 'creative create failed', detail: creative }); continue; }

      // 4c. Create ad PAUSED
      const ad = extractText(await mcpCall('create_ad', {
        account_id: AD_ACCOUNT_ID, adset_id: adsetId, name: adsetName, status: 'PAUSED', creative_id: creativeId
      }));
      results.push({ city: cityName, city_key: city.key, region: city.region, adset_id: adsetId, ad_id: ad?.id || null, creative_id: creativeId, name: adsetName });
    }

    res.json({
      ok: true, campaign_id: useCampaignId, ig_media_id: igMediaId,
      lifetime_budget_usd_each: lifetimeUSD, end_time: endTime, results, steps,
      note: 'All ad sets are PAUSED. Review in Meta Ads Manager and unpause when ready.'
    });
  } catch (e) {
    res.status(500).json({ error: e.message, steps });
  }
});

// --- Ads ---
app.get('/api/ads', (req, res) => {
  const { campaign_id, adset_id } = req.query;
  let query = `SELECT a.*,
    COALESCE((SELECT SUM(spend) FROM insights_daily WHERE ad_meta_id = a.meta_id), 0) as total_spend,
    COALESCE((SELECT SUM(clicks) FROM insights_daily WHERE ad_meta_id = a.meta_id), 0) as total_clicks,
    COALESCE((SELECT SUM(link_clicks) FROM insights_daily WHERE ad_meta_id = a.meta_id), 0) as total_link_clicks,
    COALESCE((SELECT AVG(ctr) FROM insights_daily WHERE ad_meta_id = a.meta_id), 0) as avg_ctr,
    COALESCE((SELECT AVG(cpc) FROM insights_daily WHERE ad_meta_id = a.meta_id AND cpc > 0), 0) as avg_cpc
    FROM ads a WHERE 1=1`;
  const params = [];
  if (campaign_id) { query += ' AND a.campaign_meta_id = ?'; params.push(campaign_id); }
  if (adset_id) { query += ' AND a.adset_meta_id = ?'; params.push(adset_id); }
  query += ' ORDER BY total_spend DESC';
  res.json(all(query, params));
});

app.patch('/api/ads/:metaId', async (req, res) => {
  const { status } = req.body;
  if (status) {
    await mcpCall('update_ad', { ad_id: req.params.metaId, status });
    run('UPDATE ads SET status = ?, updated_at = datetime("now") WHERE meta_id = ?', [status, req.params.metaId]);
  }
  res.json({ ok: true });
});

// --- Leads ---
app.get('/api/leads', (req, res) => {
  res.json(all(`SELECT l.*, a.name as agent_name, c.name as campaign_name
    FROM leads l LEFT JOIN agents a ON a.id = l.agent_id
    LEFT JOIN campaigns c ON c.meta_id = l.campaign_meta_id
    ORDER BY l.updated_at DESC`));
});

app.post('/api/leads', (req, res) => {
  const { phone, name, campaign_meta_id, adset_meta_id, ad_meta_id, source, stage, score, agent_id, notes } = req.body;
  run(`INSERT INTO leads (phone, name, campaign_meta_id, adset_meta_id, ad_meta_id, source, stage, score, agent_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [phone, name, campaign_meta_id, adset_meta_id, ad_meta_id, source, stage || 'cold', score || 0, agent_id || null, notes]);
  const last = get("SELECT last_insert_rowid() as id");
  const leadId = last?.id;
  if (leadId && campaign_meta_id) {
    run("INSERT INTO funnel_events (lead_id, campaign_meta_id, event_type) VALUES (?, ?, 'conversation_start')", [leadId, campaign_meta_id]);
  }
  res.json({ id: leadId });
});

app.patch('/api/leads/:id', (req, res) => {
  const { stage, score, agent_id, notes } = req.body;
  const updates = [];
  const params = [];
  if (stage) { updates.push('stage = ?'); params.push(stage); }
  if (score != null) { updates.push('score = ?'); params.push(score); }
  if (agent_id) { updates.push('agent_id = ?'); params.push(agent_id); }
  if (notes != null) { updates.push('notes = ?'); params.push(notes); }
  updates.push("updated_at = datetime('now')");
  params.push(parseInt(req.params.id));
  run(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`, params);

  if (stage) {
    const eventMap = { warm: 'qualified', hot: 'hot', customer: 'sale' };
    if (eventMap[stage]) {
      const lead = get('SELECT * FROM leads WHERE id = ?', [parseInt(req.params.id)]);
      if (lead) run('INSERT INTO funnel_events (lead_id, campaign_meta_id, event_type) VALUES (?, ?, ?)',
        [parseInt(req.params.id), lead.campaign_meta_id, eventMap[stage]]);
    }
  }
  res.json({ ok: true });
});

// --- Sales ---
app.get('/api/sales', (req, res) => {
  res.json(all(`SELECT s.*, l.name as lead_name, l.phone, c.name as campaign_name, a.name as agent_name
    FROM sales s LEFT JOIN leads l ON l.id = s.lead_id
    LEFT JOIN campaigns c ON c.meta_id = s.campaign_meta_id
    LEFT JOIN agents a ON a.id = s.agent_id
    ORDER BY s.created_at DESC`));
});

app.post('/api/sales', (req, res) => {
  const { lead_id, conversation_id, campaign_meta_id, agent_id, amount, product } = req.body;
  run(`INSERT INTO sales (lead_id, conversation_id, campaign_meta_id, agent_id, amount, product)
    VALUES (?, ?, ?, ?, ?, ?)`, [lead_id, conversation_id, campaign_meta_id, agent_id, amount, product]);
  const last = get("SELECT last_insert_rowid() as id");
  if (lead_id) {
    run("UPDATE leads SET stage = 'customer', updated_at = datetime('now') WHERE id = ?", [lead_id]);
    run("INSERT INTO funnel_events (lead_id, campaign_meta_id, event_type) VALUES (?, ?, 'sale')", [lead_id, campaign_meta_id]);
  }
  res.json({ id: last?.id });
});

// --- Agents ---
app.get('/api/agents', (req, res) => {
  res.json(all(`SELECT a.*,
    (SELECT COUNT(*) FROM leads WHERE agent_id = a.id) as total_leads,
    (SELECT COUNT(*) FROM leads WHERE agent_id = a.id AND stage = 'customer') as total_sales,
    (SELECT COUNT(*) FROM leads WHERE agent_id = a.id AND stage = 'hot') as hot_leads
    FROM agents a ORDER BY a.name`));
});

app.post('/api/agents', (req, res) => {
  run('INSERT INTO agents (name) VALUES (?)', [req.body.name]);
  const last = get("SELECT last_insert_rowid() as id");
  res.json({ id: last?.id });
});

// --- Alerts ---
app.get('/api/alerts', (req, res) => {
  res.json(all(`SELECT a.*, c.name as campaign_name FROM alerts a
    LEFT JOIN campaigns c ON c.meta_id = a.campaign_meta_id
    ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, a.created_at DESC`));
});

app.patch('/api/alerts/:id/resolve', (req, res) => {
  run('UPDATE alerts SET resolved = 1 WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// --- Existing Posts (for "Use existing post" ad creation) ---
app.get('/api/page-posts', async (req, res) => {
  try {
    const pageSetting = get("SELECT value FROM settings WHERE key = 'page_id'");
    let pageId = pageSetting?.value;
    if (!pageId) {
      const pagesResult = extractText(await mcpCall('get_account_pages', { account_id: AD_ACCOUNT_ID }));
      pageId = pagesResult?.data?.[0]?.id;
      if (pageId) run("INSERT INTO settings (key, value) VALUES ('page_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [pageId]);
    }
    if (!pageId) return res.json([]);

    // Fetch recent page posts via Graph API through Pipeboard
    // Use the pipeboard proxy to get posts
    const postsResult = extractText(await mcpCall('get_ad_creatives', { ad_id: 'none' }));
    // Fallback: return page info so user can enter post ID manually
    res.json({ page_id: pageId, note: 'Enter post ID manually or select from Instagram' });
  } catch (e) {
    res.json({ page_id: null, error: e.message });
  }
});

app.get('/api/ig-posts', async (req, res) => {
  try {
    // Get Instagram accounts linked to the ad account
    const igResult = extractText(await mcpCall('get_instagram_accounts', { account_id: AD_ACCOUNT_ID }));
    const igAccounts = igResult?.data || igResult || [];
    res.json(Array.isArray(igAccounts) ? igAccounts : [igAccounts]);
  } catch (e) {
    res.json({ error: e.message });
  }
});

// --- Settings ---
app.get('/api/settings', (req, res) => {
  const rows = all('SELECT * FROM settings');
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

app.post('/api/settings', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }
  res.json({ ok: true });
});

// ─── SALES & ROI (Google Sheets join) ───
function setting(k, def = '') { const r = get('SELECT value FROM settings WHERE key = ?', [k]); return r ? r.value : def; }

// minimal CSV parser (handles quoted fields, commas, newlines)
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const normPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
const num = v => { const n = parseFloat(String(v || '').replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; };

async function fetchCSV(url) {
  if (!url) return [];
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`CSV fetch ${r.status}`);
  return parseCSV(await r.text());
}

// ─── Phase 2: TRUE POS revenue from SQL Server, attributed to ad campaigns ───
const SQL_PROXY_URL = 'https://aggrievedly-spryest-hattie.ngrok-free.dev/V1/query';
const SQL_PROXY_TOKEN = 'Sahiba_CZSfEghwaD4s';
const VENDEDOR_TO_AGENT = { YAZMIN: 'Jazmin', YOANA: 'Yoana', YOANA_ECOMMERCE: 'Yoana', 'E-COMMERCE': 'Nancy', NANCY: 'Nancy' };
const YOANA_CUTOFF = '2026-05-03';
function classifyChannel(vendedor, dateStr) {
  if (!vendedor) return 'walkin';
  const v = String(vendedor).trim().toUpperCase();
  if (v === 'YAZMIN' || v === 'YOANA_ECOMMERCE' || v === 'E-COMMERCE' || v === 'NANCY') return 'agent_online';
  if (v === 'YOANA') { if (!dateStr) return 'walkin'; return String(dateStr).slice(0, 10) < YOANA_CUTOFF ? 'agent_online' : 'walkin'; }
  return 'walkin';
}
async function sqlQuery(query) {
  const r = await fetch(SQL_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SQL_PROXY_TOKEN, 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify({ query })
  });
  if (!r.ok) throw new Error(`SQL proxy ${r.status}`);
  const d = await r.json();
  return d.data || d.rows || d.recordset || (Array.isArray(d) ? d : []);
}

app.get('/api/sql-roi', async (req, res) => {
  try {
    const days = Math.max(7, Math.min(parseInt(req.query.days) || 90, 365));
    const rate = parseFloat(setting('mxn_rate', '18')) || 18;
    const leadsUrl = setting('sheet_leads_url');
    const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

    // 1. Build phone → campaign map from the leads/attribution sheet
    const leadByPhone = {};
    if (leadsUrl) {
      const rows = await fetchCSV(leadsUrl);
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || r.length < 4) continue;
        const phone = normPhone(r[1]);
        const ids = r.map(x => String(x || '').trim()).filter(x => /^\d{15,}$/.test(x));
        if (phone && ids[0] && !leadByPhone[phone]) leadByPhone[phone] = { camp: ids[0], adset: ids[1] || '', ad: ids[2] || '' };
      }
    }

    // 2. Pull POS sale lines with phone from both online stores
    const cols = `NO_REFEREN, Fecha, Vendedor, Cantidad, Precio_Venta, CustPhone`;
    const [cercu, leona] = await Promise.all([
      sqlQuery(`SELECT TOP 30000 ${cols} FROM MOVS_CIRCUNVALACION WHERE CustPhone IS NOT NULL AND CustPhone <> '' AND Movimiento='TK' AND Fecha >= '${since}'`),
      sqlQuery(`SELECT TOP 30000 ${cols} FROM MOVS_LEONA WHERE CustPhone IS NOT NULL AND CustPhone <> '' AND CustCliente IS NOT NULL AND CustCliente <> '' AND Fecha >= '${since}'`)
    ]);
    const lines = [...cercu.map(r => ({ ...r, store: 'TS0002' })), ...leona.map(r => ({ ...r, store: 'TS0001' }))];

    // 2b. FB STORE-GIFT tickets — gift articles 126OB / 130OB at $0 = customer came from a FB ad
    //     (only ad viewers know to ask for the gift). Whole ticket counts as ad-driven revenue.
    const GIFT_MATCH = `(Articulo LIKE '126OB%' OR Articulo LIKE '%/126OB%' OR Articulo LIKE '126OB-%'
                        OR Articulo LIKE '130OB%' OR Articulo LIKE '%/130OB%' OR Articulo LIKE '130OB-%')`;
    const giftKeys = new Set();      // store|NO_REFEREN of gift tickets
    let giftRevMXN = 0; const giftPhones = new Set(); let giftTickets = 0;
    try {
      const giftStores = [['MOVS_CIRCUNVALACION', 'TS0002'], ['MOVS_LEONA', 'TS0001']];
      for (const [tbl, store] of giftStores) {
        const ids = await sqlQuery(
          `SELECT DISTINCT NO_REFEREN FROM ${tbl} WHERE Movimiento='TK' AND Fecha >= '${since}' AND Precio_Venta = 0 AND ${GIFT_MATCH}`
        );
        const list = ids.map(r => String(r.NO_REFEREN)).filter(Boolean).slice(0, 4000);
        if (!list.length) continue;
        const inClause = list.map(x => `'${x.replace(/'/g, "''")}'`).join(',');
        const glines = await sqlQuery(
          `SELECT NO_REFEREN, Cantidad, Precio_Venta, CustPhone FROM ${tbl} WHERE Movimiento='TK' AND NO_REFEREN IN (${inClause})`
        );
        const seen = new Set();
        for (const g of glines) {
          const key = store + '|' + g.NO_REFEREN;
          giftKeys.add(key);
          if (!seen.has(key)) { seen.add(key); giftTickets++; }
          giftRevMXN += (parseFloat(g.Cantidad) || 0) * (parseFloat(g.Precio_Venta) || 0);
          const ph = normPhone(g.CustPhone); if (ph) giftPhones.add(ph);
        }
      }
    } catch (e) { console.error('gift query error:', e.message); }

    // 3. Classify + aggregate
    const tickets = {};            // store|ticket -> {phone, agent, channel, total, date}
    const agentStats = {};         // agent -> {online:{tickets:Set,mxn}, walkin:{...}}
    const phoneFirst = {};         // phone -> earliest date in window
    let onlineMXN = 0, walkinMXN = 0, adWalkinMXN = 0;
    for (const ln of lines) {
      const phone = normPhone(ln.CustPhone);
      if (!phone) continue;
      const vend = (ln.Vendedor || '').trim();
      const dateStr = ln.Fecha ? String(ln.Fecha).slice(0, 10) : '';
      const base = classifyChannel(vend, dateStr);
      // Reclassify: a "walk-in" whose phone matches a Facebook lead is in fact
      // ad-driven revenue (customer saw the ad, came to the store). Gift tickets
      // are already excluded below (continue) so there is no double-count.
      const channel = (base === 'walkin' && leadByPhone[phone]) ? 'ad_walkin' : base;
      const isAd = channel === 'agent_online' || channel === 'ad_walkin';
      const agent = VENDEDOR_TO_AGENT[vend.toUpperCase()] || (isAd ? 'Other-online' : 'Walk-in');
      const lineTotal = (parseFloat(ln.Cantidad) || 0) * (parseFloat(ln.Precio_Venta) || 0);
      const tkey = ln.store + '|' + ln.NO_REFEREN;
      if (giftKeys.has(tkey)) continue;   // counted in FB Store-Gift bucket, skip to avoid double-count
      if (!tickets[tkey]) tickets[tkey] = { phone, agent, channel, total: 0, date: dateStr };
      tickets[tkey].total += lineTotal;
      if (channel === 'agent_online') onlineMXN += lineTotal;
      else if (channel === 'ad_walkin') adWalkinMXN += lineTotal;
      else walkinMXN += lineTotal;
      if (!phoneFirst[phone] || dateStr < phoneFirst[phone]) phoneFirst[phone] = dateStr;
    }

    // 4. Per-campaign attribution (online tickets only) + agent scorecard
    const campAgg = {};            // camp -> {tickets, mxn, newCust:Set, phones:Set}
    for (const [, t] of Object.entries(tickets)) {
      const a = agentStats[t.agent] || (agentStats[t.agent] = { onlineTk: new Set(), onlineMXN: 0, walkinTk: new Set(), walkinMXN: 0, adWalkinTk: new Set(), adWalkinMXN: 0 });
      const tid = t.phone + '|' + t.date;
      const isAd = t.channel === 'agent_online' || t.channel === 'ad_walkin';
      if (t.channel === 'agent_online') { a.onlineTk.add(tid); a.onlineMXN += t.total; }
      else if (t.channel === 'ad_walkin') { a.adWalkinTk.add(tid); a.adWalkinMXN += t.total; }
      else { a.walkinTk.add(tid); a.walkinMXN += t.total; }
      if (!isAd) continue;
      const attr = leadByPhone[t.phone];
      if (!attr) continue;
      const c = campAgg[attr.camp] || (campAgg[attr.camp] = { tickets: 0, mxn: 0, phones: new Set() });
      c.tickets++; c.mxn += t.total; c.phones.add(t.phone);
    }

    // 5. Meta spend by campaign
    const until = new Date().toISOString().slice(0, 10);
    let campSpend = {}, campName = {};
    try {
      const ins = extractText(await mcpCall('get_insights', { object_id: AD_ACCOUNT_ID, level: 'campaign', time_range: { since, until } }));
      for (const c of (ins?.data || [])) { campSpend[c.campaign_id] = parseFloat(c.spend || 0); campName[c.campaign_id] = c.campaign_name; }
    } catch (e) {}

    const campaigns = Object.keys({ ...campAgg, ...campSpend }).map(id => {
      const s = campAgg[id] || { tickets: 0, mxn: 0, phones: new Set() };
      const spendUSD = campSpend[id] || 0;
      const revUSD = s.mxn / rate;
      return {
        id, name: campName[id] || id,
        orders: s.tickets, customers: s.phones.size,
        revenueUSD: revUSD, spendUSD,
        costPerOrder: s.tickets ? spendUSD / s.tickets : null,
        roas: spendUSD ? revUSD / spendUSD : null
      };
    }).filter(c => c.spendUSD > 0 || c.orders > 0).sort((a, b) => (b.roas || -1) - (a.roas || -1));

    // Synthetic FB Store-Gift bucket (all campaigns run the gift offer → generic)
    const giftRevUSD = giftRevMXN / rate;
    if (giftTickets > 0) {
      campaigns.unshift({
        id: 'FB_STORE_GIFT', name: 'FB Store-Gift (walk-in, ad-driven)',
        orders: giftTickets, customers: giftPhones.size,
        revenueUSD: giftRevUSD, spendUSD: 0,
        costPerOrder: null, roas: null, isGiftBucket: true
      });
    }

    const agents = Object.entries(agentStats).map(([name, v]) => ({
      name,
      onlineOrders: v.onlineTk.size, onlineRevUSD: v.onlineMXN / rate,
      adWalkinOrders: v.adWalkinTk.size, adWalkinRevUSD: v.adWalkinMXN / rate,
      walkinOrders: v.walkinTk.size, walkinRevUSD: v.walkinMXN / rate
    })).sort((a, b) => (b.onlineRevUSD + b.adWalkinRevUSD) - (a.onlineRevUSD + a.adWalkinRevUSD));

    // CDMX walk-in attribution — the "walkinMXN" bucket (non-agent, no FB-lead phone match,
    // not gift) is almost entirely Leona Vicario + Circunvalación store walk-in revenue, which
    // is driven by the Mixcalco-radius ad sets. Pull those ad sets' spend and compute a real
    // ROAS for the CDMX walk-in channel.
    const mixcalcoIds = setting('mixcalco_adset_ids').split(',').map(s => s.trim()).filter(Boolean);
    let mixcalcoSpendUSD = 0, mixcalcoSpendByAdset = [];
    if (mixcalcoIds.length) {
      const until = new Date().toISOString().slice(0, 10);
      for (const id of mixcalcoIds) {
        try {
          const ins = extractText(await mcpCall('get_insights', { object_id: id, time_range: { since, until } }));
          const sp = (ins?.data || []).reduce((a, r) => a + (parseFloat(r.spend) || 0), 0);
          mixcalcoSpendUSD += sp;
          mixcalcoSpendByAdset.push({ adset_id: id, spendUSD: sp });
        } catch (e) { mixcalcoSpendByAdset.push({ adset_id: id, error: e.message }); }
      }
    }
    const cdmxAdWalkinUSD = walkinMXN / rate;
    const mixcalcoROAS = mixcalcoSpendUSD > 0 ? cdmxAdWalkinUSD / mixcalcoSpendUSD : null;

    res.json({
      ok: true, days, rate, since,
      totals: {
        onlineRevUSD: onlineMXN / rate, walkinRevUSD: walkinMXN / rate,
        onlineRevMXN: onlineMXN, walkinRevMXN: walkinMXN,
        adWalkinRevUSD: adWalkinMXN / rate, adWalkinRevMXN: adWalkinMXN,
        adWalkinTickets: Object.values(tickets).filter(t => t.channel === 'ad_walkin').length,
        giftRevUSD, giftRevMXN, giftTickets, giftCustomers: giftPhones.size,
        // NEW: CDMX walk-in attributed to Mixcalco ads (the bulk of "Other walk-in")
        cdmxAdWalkinRevMXN: walkinMXN, cdmxAdWalkinRevUSD: cdmxAdWalkinUSD,
        mixcalcoSpendUSD, mixcalcoROAS, mixcalcoSpendByAdset,
        adDrivenRevUSD: (onlineMXN + adWalkinMXN + giftRevMXN + walkinMXN) / rate,
        ticketCount: Object.keys(tickets).length, lineCount: lines.length
      },
      campaigns, agents
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Phase 3: GEO ROI — state-by-state revenue per ad lead ───
// Mexican LADAs (area codes) decode the state a phone was originally registered in.
// Combined with POS phone match this gives revenue-per-lead per state, the basis
// for the SCALE/KEEP/CUT geo budget allocation.
const LADA_TWO = { '33': 'Jalisco', '55': 'CDMX', '81': 'Nuevo León' };
const LADA_THREE = {
  '222':'Puebla','223':'Puebla','224':'Puebla','225':'Puebla','227':'Tlaxcala','228':'Veracruz','229':'Veracruz','231':'Puebla','232':'Puebla','233':'Puebla','236':'Puebla','237':'Hidalgo','238':'Puebla',
  '241':'Tlaxcala','243':'Puebla','244':'Puebla','245':'Hidalgo','246':'Tlaxcala','247':'Puebla','248':'Puebla','249':'Puebla',
  '271':'Veracruz','272':'Veracruz','273':'Veracruz','274':'Veracruz','275':'Veracruz','278':'Veracruz','281':'Veracruz','282':'Veracruz','283':'Veracruz','284':'Veracruz','285':'Veracruz','287':'Oaxaca','288':'Veracruz','294':'Veracruz','296':'Veracruz','297':'Veracruz',
  '311':'Nayarit','312':'Colima','313':'Colima','314':'Colima','315':'Jalisco','316':'Jalisco','317':'Jalisco','318':'Jalisco','319':'Jalisco',
  '321':'Jalisco','322':'Jalisco','323':'Nayarit','324':'Nayarit','325':'Nayarit','326':'Nayarit','327':'Nayarit','328':'Nayarit','329':'Nayarit',
  '341':'Michoacán','342':'Michoacán','343':'Jalisco','344':'Jalisco','345':'Jalisco','346':'Jalisco','347':'Jalisco','348':'Jalisco','349':'Jalisco',
  '351':'Michoacán','352':'Michoacán','353':'Michoacán','354':'Michoacán','355':'Michoacán','356':'Michoacán','357':'Michoacán','358':'Michoacán','359':'Michoacán',
  '372':'Jalisco','373':'Jalisco','374':'Jalisco','375':'Jalisco','376':'Jalisco','377':'Jalisco','378':'Jalisco','381':'Jalisco','382':'Jalisco','383':'Jalisco','384':'Jalisco','385':'Jalisco','386':'Jalisco','387':'Jalisco','388':'Jalisco','389':'Jalisco','391':'Jalisco','392':'Jalisco','393':'Jalisco','395':'Jalisco','396':'Jalisco',
  '412':'Guanajuato','413':'Guanajuato','414':'Guanajuato','415':'Guanajuato','417':'Guanajuato','418':'Guanajuato','419':'Guanajuato',
  '421':'Querétaro','422':'Querétaro','423':'Querétaro','424':'Guanajuato','425':'Querétaro','426':'Guanajuato','427':'Querétaro','428':'Querétaro','429':'Querétaro','431':'Guanajuato','432':'Guanajuato','433':'Guanajuato','434':'Guanajuato','435':'Guanajuato','436':'Guanajuato','437':'Guanajuato','438':'Guanajuato',
  '441':'Querétaro','442':'Querétaro','443':'Michoacán','444':'San Luis Potosí','445':'Querétaro','447':'San Luis Potosí','449':'Aguascalientes','451':'Michoacán','452':'Michoacán','453':'Michoacán','454':'Michoacán','455':'Michoacán','456':'Michoacán','457':'Michoacán','458':'Michoacán','459':'Michoacán',
  '461':'Guanajuato','462':'Guanajuato','464':'Guanajuato','465':'Guanajuato','466':'Guanajuato','467':'Guanajuato','468':'Guanajuato','469':'Guanajuato',
  '471':'Guanajuato','472':'Guanajuato','473':'Guanajuato','474':'Guanajuato','475':'Jalisco','476':'Guanajuato','477':'Guanajuato','478':'Guanajuato',
  '481':'San Luis Potosí','482':'San Luis Potosí','483':'San Luis Potosí','485':'San Luis Potosí','486':'San Luis Potosí','487':'San Luis Potosí','488':'Jalisco','489':'San Luis Potosí','492':'Zacatecas','493':'Zacatecas','494':'Zacatecas','496':'Zacatecas','498':'Zacatecas','499':'Zacatecas',
  '612':'Baja California Sur','613':'Baja California Sur','614':'Chihuahua','615':'Baja California Sur','616':'Baja California','618':'Durango','621':'Chihuahua','622':'Sonora','623':'Sonora','624':'Baja California Sur','625':'Chihuahua','626':'Chihuahua','627':'Chihuahua','628':'Chihuahua','629':'Chihuahua','631':'Sonora','632':'Sonora','633':'Sonora','634':'Sonora','635':'Chihuahua','636':'Chihuahua','637':'Sonora','638':'Sonora','639':'Chihuahua',
  '641':'Sonora','642':'Sonora','643':'Sonora','644':'Sonora','645':'Sonora','646':'Baja California','647':'Sonora','648':'Sonora','649':'Baja California',
  '651':'Sonora','652':'Sonora','653':'Sonora','656':'Chihuahua','658':'Sonora','659':'Chihuahua','661':'Baja California','662':'Sonora','664':'Baja California','665':'Baja California','667':'Sinaloa','668':'Sinaloa','669':'Sinaloa','671':'Sinaloa','672':'Sinaloa','673':'Sinaloa','674':'Sinaloa','675':'Sinaloa','677':'Sinaloa','686':'Baja California','687':'Sinaloa','688':'Sinaloa','689':'Sinaloa','691':'Sinaloa','692':'Sinaloa','693':'Sinaloa','694':'Sinaloa','695':'Sinaloa','696':'Sinaloa','697':'Sinaloa','698':'Sinaloa',
  '711':'Edo. México','712':'Edo. México','713':'Edo. México','714':'Edo. México','715':'Edo. México','716':'Edo. México','717':'Edo. México','718':'Edo. México','719':'Edo. México','721':'Edo. México','722':'Edo. México','723':'Edo. México','724':'Edo. México','725':'Edo. México','726':'Edo. México','727':'Edo. México','728':'Edo. México','729':'Edo. México',
  '731':'Edo. México','732':'Edo. México','733':'Edo. México','734':'Edo. México','735':'Morelos','736':'Morelos','737':'Morelos','738':'Morelos','739':'Morelos',
  '741':'Guerrero','742':'Guerrero','743':'Guerrero','744':'Guerrero','745':'Guerrero','746':'Guerrero','747':'Guerrero','748':'Guerrero','749':'Guerrero','751':'Guerrero','753':'Michoacán','754':'Guerrero','755':'Guerrero','756':'Guerrero','757':'Guerrero','758':'Guerrero','759':'Guerrero',
  '761':'Morelos','762':'Morelos','763':'Morelos','764':'Morelos','765':'Morelos','766':'Morelos','767':'Morelos','768':'Morelos','769':'Morelos','777':'Morelos',
  '771':'Hidalgo','772':'Hidalgo','773':'Hidalgo','774':'Hidalgo','775':'Hidalgo','776':'Hidalgo','778':'Hidalgo','779':'Hidalgo','781':'Hidalgo','782':'Veracruz','783':'Veracruz','784':'Veracruz','785':'Veracruz','787':'Veracruz','789':'Veracruz',
  '791':'Hidalgo','792':'Hidalgo','793':'Hidalgo','794':'Hidalgo','795':'Hidalgo','796':'Hidalgo','797':'Hidalgo','798':'Hidalgo','799':'Hidalgo',
  '811':'Nuevo León','812':'Nuevo León','813':'Nuevo León','814':'Nuevo León','815':'Nuevo León','816':'Nuevo León','817':'Nuevo León','818':'Nuevo León','819':'Nuevo León','821':'Nuevo León','823':'Nuevo León','824':'Nuevo León','825':'Nuevo León','826':'Nuevo León','827':'Nuevo León','828':'Tamaulipas','829':'Nuevo León','831':'Tamaulipas','832':'Veracruz','833':'Tamaulipas','834':'Tamaulipas','835':'Tamaulipas','836':'Tamaulipas','837':'Tamaulipas','838':'Tamaulipas','841':'Nuevo León','842':'Coahuila','843':'Coahuila','844':'Coahuila','845':'Coahuila','846':'Coahuila','847':'Coahuila','861':'Coahuila','862':'Coahuila','864':'Coahuila','866':'Coahuila','867':'Tamaulipas','868':'Tamaulipas','869':'Tamaulipas','871':'Coahuila','872':'Coahuila','873':'Coahuila','877':'Coahuila','878':'Coahuila',
  '891':'Tamaulipas','892':'Tamaulipas','894':'Tamaulipas','895':'Tamaulipas','897':'Tamaulipas','898':'Tamaulipas','899':'Tamaulipas',
  '921':'Veracruz','922':'Veracruz','923':'Veracruz','924':'Veracruz','932':'Tabasco','933':'Tabasco','934':'Tabasco','936':'Tabasco','937':'Tabasco','938':'Campeche',
  '951':'Oaxaca','953':'Oaxaca','954':'Oaxaca','958':'Oaxaca','971':'Oaxaca','972':'Oaxaca',
  '961':'Chiapas','962':'Chiapas','963':'Chiapas','964':'Chiapas','965':'Chiapas','966':'Chiapas','967':'Chiapas','968':'Chiapas',
  '981':'Campeche','982':'Campeche','983':'Quintana Roo','984':'Quintana Roo','985':'Yucatán','986':'Yucatán','987':'Quintana Roo','988':'Yucatán','991':'Yucatán','992':'Yucatán','993':'Tabasco','994':'Tabasco','995':'Tabasco','996':'Tabasco','997':'Campeche','998':'Quintana Roo','999':'Yucatán'
};
function phoneToState(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (!d.startsWith('52')) return null;          // not Mexican
  let s = d.slice(2);
  if (s[0] === '1' && s.length === 11) s = s.slice(1);  // strip mobile prefix
  if (s.length < 10) return null;
  return LADA_TWO[s.slice(0, 2)] || LADA_THREE[s.slice(0, 3)] || null;
}

// Cache the phone→state map between calls (CSV rarely changes, parsing 132k rows is slow)
let _geoCache = { mtime: 0, phone2state: null, leadsByState: null };
function loadContactsMap() {
  const path = setting('contacts_csv_path');
  if (!path || !existsSync(path)) throw new Error('contacts_csv_path not set or file missing — re-export respond.io CSV and update setting');
  const { mtimeMs } = statSync(path);
  if (_geoCache.mtime === mtimeMs && _geoCache.phone2state) return _geoCache;
  const rows = parseCSV(readFileSync(path, 'utf-8'));
  if (rows.length < 2) throw new Error('contacts CSV is empty');
  const header = rows[0].map(h => h.toLowerCase().trim());
  const phoneIdx = header.findIndex(h => h.includes('phone'));
  if (phoneIdx < 0) throw new Error('PhoneNumber column not found in contacts CSV');
  const phone2state = {}, leadsByState = {};
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i][phoneIdx]; if (!p) continue;
    const st = phoneToState(p); if (!st) continue;
    const np = normPhone(p); if (!np) continue;
    if (!phone2state[np]) {                       // first occurrence wins
      phone2state[np] = st;
      leadsByState[st] = (leadsByState[st] || 0) + 1;
    }
  }
  _geoCache = { mtime: mtimeMs, phone2state, leadsByState };
  return _geoCache;
}

app.get('/api/geo-roi', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const rate = parseFloat(setting('mxn_rate', '18')) || 18;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const { phone2state, leadsByState } = loadContactsMap();

    // Pull POS lines (only those with a phone — required for the state join)
    const lines = [];
    for (const tbl of ['MOVS_CIRCUNVALACION', 'MOVS_LEONA']) {
      const rows = await sqlQuery(
        `SELECT NO_REFEREN, CustPhone, Cantidad, Precio_Venta, Fecha FROM ${tbl}
         WHERE Movimiento='TK' AND Fecha >= '${since}' AND CustPhone IS NOT NULL`
      );
      for (const r of rows) lines.push({ ...r, store: tbl });
    }

    // Aggregate by state (one revenue figure per ticket — sum lines first, then map state once)
    const ticketAgg = {};   // store|NO_REFEREN -> { phone, mxn, state }
    let totalLines = 0, matchedLines = 0;
    for (const ln of lines) {
      totalLines++;
      const ph = normPhone(ln.CustPhone); if (!ph) continue;
      const st = phone2state[ph]; if (!st) continue;
      matchedLines++;
      const tkey = ln.store + '|' + ln.NO_REFEREN;
      const amt = (parseFloat(ln.Cantidad) || 0) * (parseFloat(ln.Precio_Venta) || 0);
      if (!ticketAgg[tkey]) ticketAgg[tkey] = { phone: ph, state: st, mxn: 0 };
      ticketAgg[tkey].mxn += amt;
    }

    const stateAgg = {};    // state -> { tickets, mxn, phones:Set }
    for (const t of Object.values(ticketAgg)) {
      const s = stateAgg[t.state] || (stateAgg[t.state] = { tickets: 0, mxn: 0, phones: new Set() });
      s.tickets++; s.mxn += t.mxn; s.phones.add(t.phone);
    }

    // Build the table, tier each state
    // Tiers (USD per lead, 90-day): SCALE ≥ $3 · KEEP $1–3 · CUT < $1 · TEST < 50 leads
    const states = [];
    const seen = new Set([...Object.keys(stateAgg), ...Object.keys(leadsByState)]);
    for (const st of seen) {
      const leads = leadsByState[st] || 0;
      const s = stateAgg[st] || { tickets: 0, mxn: 0, phones: new Set() };
      const tickets = s.tickets, revMXN = s.mxn, revUSD = revMXN / rate;
      const customers = s.phones.size;
      const avgTicketMXN = tickets ? revMXN / tickets : 0;
      const convPct = leads ? 100 * customers / leads : 0;
      const usdPerLead = leads ? revUSD / leads : 0;
      let tier;
      if (leads < 50) tier = 'TEST';
      else if (st === 'CDMX') tier = 'REVIEW';                           // walk-in undercount, treat separately
      else if (usdPerLead >= 3) tier = 'SCALE';
      else if (usdPerLead >= 1) tier = 'KEEP';
      else tier = 'CUT';
      states.push({ state: st, leads, tickets, customers, revMXN, revUSD, avgTicketMXN, avgTicketUSD: avgTicketMXN / rate, convPct, usdPerLead, tier });
    }
    states.sort((a, b) => b.usdPerLead - a.usdPerLead);

    res.json({
      ok: true, days, since, rate,
      lineStats: { totalLines, matchedLines, matchPct: totalLines ? 100 * matchedLines / totalLines : 0 },
      contactStats: { withState: Object.keys(phone2state).length },
      caveat: 'CDMX is flagged REVIEW: both stores are in CDMX, so most CDMX customers walk in without leaving a phone on the POS ticket → phone-match misses them. CDMX usdPerLead is undercounted; evaluate via foot traffic instead.',
      states
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── CMO Recommendation Action Log ───
// User clicks "✓ Actioned" / "✗ Ignored" / "≠ Different" on a CMO recommendation;
// we log it so next-morning report can close the loop ("yesterday you scaled X, here's
// the 24hr result"). All fields optional except rec_bucket + rec_action + user_choice.
app.post('/api/rec-action', (req, res) => {
  try {
    const { ad_id, ad_name, campaign_name, rec_bucket, rec_action, user_choice, before_daily_budget, before_cpr, note } = req.body;
    if (!rec_bucket || !rec_action || !user_choice) return res.status(400).json({ ok: false, error: 'rec_bucket + rec_action + user_choice required' });
    run(`INSERT INTO recommendation_actions
         (ad_id, ad_name, campaign_name, rec_bucket, rec_action, user_choice, before_daily_budget, before_cpr, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ad_id || null, ad_name || null, campaign_name || null, rec_bucket, rec_action, user_choice,
       before_daily_budget != null ? before_daily_budget : null, before_cpr != null ? before_cpr : null, note || null]);
    res.json({ ok: true, logged_at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Read recent actions (default last 14 days, optionally filter by ad_id)
app.get('/api/rec-actions', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const ad = req.query.ad_id;
    const rows = ad
      ? all(`SELECT * FROM recommendation_actions WHERE ad_id = ? AND taken_at >= datetime('now', '-' || ? || ' days') ORDER BY taken_at DESC`, [ad, days])
      : all(`SELECT * FROM recommendation_actions WHERE taken_at >= datetime('now', '-' || ? || ' days') ORDER BY taken_at DESC LIMIT 200`, [days]);
    res.json({ ok: true, count: rows.length, actions: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── Budget Snapshot Job — nightly capture of per-adset cap + actual spend ───
// Runs at 23:55 Mexico City local time (UTC-6, so 05:55 UTC next day). Persists to
// budget_snapshots table so the historical "designated cap vs actual spend" line
// in the Budget Tracker is REAL data from that day, not today's cap projected back.
async function runBudgetSnapshot() {
  const ACCOUNTS = [{ id: 'act_1622779349328736', name: 'Sahiba-MX' }];
  // "Today" in Mexico City — snapshot date = today's date in MX TZ
  const mxNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const snapDate = mxNow.toISOString().slice(0, 10);
  let inserted = 0;
  for (const acct of ACCOUNTS) {
    try {
      const [adsetsRaw, campsRaw] = await Promise.all([
        mcpCall('get_adsets', { account_id: acct.id }),
        mcpCall('get_campaigns', { account_id: acct.id })
      ]);
      const campsById = {};
      (extractText(campsRaw)?.data || []).forEach(c => { campsById[c.id] = c; });
      const sets = (extractText(adsetsRaw)?.data || []).filter(s => s.status === 'ACTIVE' || s.effective_status === 'ACTIVE');
      for (const s of sets) {
        const camp = campsById[s.campaign_id] || {};
        const dailyB = parseFloat(s.daily_budget || 0) / 100;
        const campDailyB = parseFloat(camp.daily_budget || 0) / 100;
        const mode = campDailyB > 0 ? 'CBO' : 'ABO';
        // Pull today's spend for this ad set
        let spendToday = 0;
        try {
          const ins = extractText(await mcpCall('get_insights', { object_id: s.id, time_range: { since: snapDate, until: snapDate } }));
          const row = (ins?.data || [])[0] || {};
          spendToday = parseFloat(row.spend) || 0;
        } catch {}
        try {
          run(`INSERT OR REPLACE INTO budget_snapshots
                 (snapshot_date, account, account_id, campaign_id, campaign_name, campaign_mode,
                  adset_id, adset_name, daily_budget_usd, spend_usd, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [snapDate, acct.name, acct.id, s.campaign_id, camp.name || '?', mode,
             s.id, s.name, dailyB, spendToday, s.status || 'ACTIVE']);
          inserted++;
        } catch (e) { console.error('snap insert err:', e.message); }
      }
    } catch (e) { console.error('snap acct err:', e.message); }
  }
  try { saveDb(); } catch {}
  console.log(`[budget-snapshot] ${snapDate} — saved ${inserted} ad-set rows`);
  return { date: snapDate, rows_saved: inserted };
}

// Manual trigger endpoint (for testing + on-demand)
app.post('/api/budget-snapshot-now', async (req, res) => {
  try { res.json({ ok: true, ...(await runBudgetSnapshot()) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Hourly check — runs the snapshot once per day around 23:55 Mexico City time
let lastSnapshotDate = '';
setInterval(async () => {
  try {
    const mx = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const hh = mx.getHours();
    const today = mx.toISOString().slice(0, 10);
    // Fire once between 23:00 and 23:59 MX time, only once per date
    if (hh === 23 && lastSnapshotDate !== today) {
      lastSnapshotDate = today;
      await runBudgetSnapshot();
    }
  } catch (e) { console.error('[budget-snapshot] cron err:', e.message); }
}, 60 * 60 * 1000); // hourly check

// ─── Budget Tracker — daily caps per ad set / campaign / account + spend vs cap ───
// Pulls current daily_budget from every ACTIVE ad set across all tracked accounts,
// groups by campaign + account, and merges with /api/analytics daily spend data so
// the Performance Tracker tab can show "designated cap vs actual spend" by date.
//
// Caveat: Meta's API only exposes the CURRENT daily_budget — there's no budget-change
// history. Historical "designated" line is the current cap projected back. For accurate
// history going forward, the daily_health snapshot job logs nightly to db/daily-reports/.
app.get('/api/budget-tracker', async (req, res) => {
  try {
    // Sahiba-MX only (SAHIBA2026 cut off 2026-06-29; see project_sahiba2026_winding_down)
    const ACCOUNTS = [
      { id: 'act_1622779349328736', name: 'Sahiba-MX', legacy: false },
    ];

    // Pull ad sets + campaigns for both accounts in parallel
    const allAdsets = [];
    const campaignsById = {};
    for (const acct of ACCOUNTS) {
      const [adsetsRaw, campsRaw] = await Promise.all([
        mcpCall('get_adsets', { account_id: acct.id }),
        mcpCall('get_campaigns', { account_id: acct.id })
      ]);
      const camps = extractText(campsRaw)?.data || [];
      camps.forEach(c => { campaignsById[c.id] = { ...c, _account: acct.name, _legacy: acct.legacy }; });
      const sets = extractText(adsetsRaw)?.data || [];
      const active = sets.filter(s => s.status === 'ACTIVE' || s.effective_status === 'ACTIVE');
      active.forEach(s => {
        const camp = campaignsById[s.campaign_id] || {};
        const dailyB = parseFloat(s.daily_budget || 0) / 100;
        const camp_daily = parseFloat(camp.daily_budget || 0) / 100;
        allAdsets.push({
          account: acct.name,
          account_id: acct.id,
          account_legacy: acct.legacy,
          campaign_id: s.campaign_id,
          campaign_name: camp.campaign_name || camp.name || '?',
          campaign_objective: camp.objective,
          campaign_status: camp.status,
          campaign_daily_budget: camp_daily,  // > 0 means CBO
          adset_id: s.id,
          adset_name: s.name,
          adset_status: s.status,
          daily_budget: dailyB,
          lifetime_budget: parseFloat(s.lifetime_budget || 0) / 100,
          optimization_goal: s.optimization_goal,
          end_time: s.end_time || null
        });
      });
    }

    // Group by campaign (sum of ad-set budgets, or use campaign-level CBO)
    const byCampaign = {};
    for (const s of allAdsets) {
      const key = s.campaign_id;
      if (!byCampaign[key]) {
        byCampaign[key] = {
          campaign_id: s.campaign_id,
          campaign_name: s.campaign_name,
          account: s.account,
          account_legacy: s.account_legacy,
          objective: s.campaign_objective,
          campaign_status: s.campaign_status,
          mode: s.campaign_daily_budget > 0 ? 'CBO' : 'ABO',
          campaign_daily_cap: s.campaign_daily_budget,
          adset_daily_sum: 0,
          adsets: []
        };
      }
      byCampaign[key].adset_daily_sum += s.daily_budget;
      byCampaign[key].adsets.push({
        adset_id: s.adset_id, name: s.adset_name, status: s.adset_status,
        daily_budget: s.daily_budget, lifetime_budget: s.lifetime_budget,
        optimization_goal: s.optimization_goal, end_time: s.end_time
      });
    }
    const campaignsList = Object.values(byCampaign).map(c => ({
      ...c,
      effective_daily_cap: c.mode === 'CBO' ? c.campaign_daily_cap : c.adset_daily_sum
    }));

    // Group by account
    const byAccount = {};
    for (const c of campaignsList) {
      if (!byAccount[c.account]) byAccount[c.account] = { account: c.account, legacy: c.account_legacy, total_daily_cap: 0, campaigns: 0, active_adsets: 0 };
      byAccount[c.account].total_daily_cap += c.effective_daily_cap;
      byAccount[c.account].campaigns += 1;
      byAccount[c.account].active_adsets += c.adsets.length;
    }

    const grandTotalDailyCap = Object.values(byAccount).reduce((s, a) => s + a.total_daily_cap, 0);

    // Historical snapshots — per-day designated cap + spend from budget_snapshots table
    // Aggregate snapshots by date so the UI can show real "cap vs spend" history.
    const history = all(
      `SELECT snapshot_date, SUM(daily_budget_usd) AS cap, SUM(spend_usd) AS spend, COUNT(*) AS adsets
       FROM budget_snapshots WHERE snapshot_date >= date('now','-30 days')
       GROUP BY snapshot_date ORDER BY snapshot_date DESC`
    );

    res.json({
      ok: true,
      as_of: new Date().toISOString(),
      grand_total_daily_cap: grandTotalDailyCap,
      by_account: Object.values(byAccount),
      campaigns: campaignsList.sort((a, b) => b.effective_daily_cap - a.effective_daily_cap),
      adsets: allAdsets.sort((a, b) => b.daily_budget - a.daily_budget),
      history: history.map(r => ({
        date: r.snapshot_date,
        designated_cap: r.cap || 0,
        actual_spend: r.spend || 0,
        adsets: r.adsets || 0
      })),
      history_note: history.length === 0
        ? 'No nightly snapshots yet — first one runs at 23:55 Mexico City time. Hit POST /api/budget-snapshot-now to capture immediately.'
        : `${history.length} days of real snapshot history available.`
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Ad Optimizer — per-ad performance with win/lose/scale/pause flags ───
// Reads Meta insights for every ACTIVE ad over the last N days and classifies each
// against MX-market thresholds. User reviews the recommendations and acts manually
// in Ads Manager UI (per their workflow — they create + activate ads manually).
//
// Thresholds (MX wholesale fashion WhatsApp funnel norms, MXN):
//   CTR        green > 1.0%  · yellow 0.5-1% · red < 0.5%
//   CPC        green < $8    · yellow $8-15  · red > $15
//   CPM        green < $120  · yellow $120-200 · red > $200
//   Cost/Conv  green < $25   · yellow $25-50 · red > $50
//   Frequency  green < 2.5   · yellow 2.5-4 · red > 4 (fatigue)
//
// Recommendation logic:
//   PAUSE  — red on CTR OR red on Cost/Conv (after 1000+ impressions)
//   SCALE  — green on CTR + Cost/Conv + 7-day spend > $20
//   FATIGUE — red on Frequency (rotate creative)
//   LEARN  — < 1000 impressions, still in Meta's learning phase
app.get('/api/ad-optimizer', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    // Multi-account: Sahiba-MX only (SAHIBA2026 cut off 2026-06-29 — Meta restricted).
    const ACCOUNTS = [
      { id: 'act_1622779349328736', name: 'Sahiba-MX' },
    ];

    const allAdsets = [];
    for (const acct of ACCOUNTS) {
      const adsetsRaw = extractText(await mcpCall('get_adsets', { account_id: acct.id }));
      const rawList = adsetsRaw?.data || (Array.isArray(adsetsRaw) ? adsetsRaw : []);
      const active = rawList.filter(a => a.status === 'ACTIVE' || a.effective_status === 'ACTIVE');
      console.log(`[ad-optimizer] ${acct.name}: ${active.length} active ad sets`);
      active.forEach(a => { a._account = acct.name; a._account_id = acct.id; });
      allAdsets.push(...active);
    }

    const adsByAdset = {};
    for (const a of allAdsets) {
      try {
        const ar = extractText(await mcpCall('get_ads', { account_id: a._account_id, adset_id: a.id, limit: 50 }));
        const list = ar?.data || (Array.isArray(ar) ? ar : []);
        adsByAdset[a.id] = list;
      } catch (e) { adsByAdset[a.id] = []; }
    }

    // For each ad, pull insights over the window
    const adRows = [];
    for (const adset of allAdsets) {
      for (const ad of adsByAdset[adset.id] || []) {
        if (ad.status !== 'ACTIVE' && ad.effective_status !== 'ACTIVE') continue;
        try {
          const ins = extractText(await mcpCall('get_insights', {
            object_id: ad.id,
            time_range: { since, until: today }
          }));
          const row = (ins?.data || [])[0] || {};
          const spend = parseFloat(row.spend) || 0;
          const imps = parseInt(row.impressions) || 0;
          const clicks = parseInt(row.clicks) || 0;
          const ctr = parseFloat(row.ctr) || 0;
          const cpc = parseFloat(row.cpc) || 0;
          const cpm = parseFloat(row.cpm) || 0;
          const freq = parseFloat(row.frequency) || 0;
          // count messaging conversations from actions array
          const acts = row.actions || [];
          const convo = acts.find(x => x.action_type === 'onsite_conversion.messaging_conversation_started_7d' || x.action_type === 'onsite_conversion.total_messaging_connection')?.value || 0;
          const conversations = parseInt(convo) || 0;
          const costPerConv = conversations > 0 ? spend / conversations : null;
          // Convert MX market: assume account in USD; show both. (account currency was confirmed USD)
          const mxnRate = parseFloat(setting('mxn_rate', '18')) || 18;

          // Tier each metric
          const tier = (val, g, y) => val == null ? '?' : val <= g ? 'green' : val <= y ? 'yellow' : 'red';
          const tCTR = ctr >= 1 ? 'green' : ctr >= 0.5 ? 'yellow' : 'red';
          const tCPC = tier(cpc * mxnRate, 8, 15);
          const tCPM = tier(cpm * mxnRate, 120, 200);
          const tCostConv = costPerConv == null ? '?' : tier(costPerConv * mxnRate, 25, 50);
          const tFreq = freq < 2.5 ? 'green' : freq < 4 ? 'yellow' : 'red';

          // Recommendation
          let rec = 'OK', recReason = '';
          if (imps < 1000) { rec = 'LEARN'; recReason = `only ${imps} impressions — still in learning phase`; }
          else if (tFreq === 'red') { rec = 'FATIGUE'; recReason = `frequency ${freq.toFixed(1)} > 4 — audience saturated, rotate creative`; }
          else if (tCTR === 'red' || tCostConv === 'red') {
            rec = 'PAUSE';
            recReason = tCTR === 'red' ? `CTR ${(ctr).toFixed(2)}% < 0.5%` : `cost/conv $${(costPerConv*mxnRate).toFixed(0)} MXN > $50`;
          }
          else if (tCTR === 'green' && (tCostConv === 'green' || conversations === 0) && spend > 20) {
            rec = 'SCALE'; recReason = `CTR ${ctr.toFixed(2)}% + cost/conv healthy + $${spend.toFixed(0)} spent — bump budget 25%`;
          }

          adRows.push({
            account: adset._account, account_id: adset._account_id,
            ad_id: ad.id, ad_name: ad.name,
            adset_id: adset.id, adset_name: adset.name,
            spend_usd: spend, spend_mxn: spend * mxnRate,
            impressions: imps, clicks, conversations,
            ctr, cpc_usd: cpc, cpc_mxn: cpc * mxnRate,
            cpm_usd: cpm, cpm_mxn: cpm * mxnRate,
            cost_per_conv_usd: costPerConv, cost_per_conv_mxn: costPerConv ? costPerConv * mxnRate : null,
            frequency: freq,
            tiers: { ctr: tCTR, cpc: tCPC, cpm: tCPM, cost_per_conv: tCostConv, frequency: tFreq },
            recommendation: rec, recommendation_reason: recReason
          });
        } catch (e) {
          adRows.push({ ad_id: ad.id, ad_name: ad.name, adset_name: adset.name, error: e.message });
        }
      }
    }

    // Summary buckets
    const pauseList = adRows.filter(r => r.recommendation === 'PAUSE');
    const scaleList = adRows.filter(r => r.recommendation === 'SCALE');
    const fatigueList = adRows.filter(r => r.recommendation === 'FATIGUE');
    const learnList = adRows.filter(r => r.recommendation === 'LEARN');
    const okList = adRows.filter(r => r.recommendation === 'OK');

    res.json({
      ok: true, window: { days, since, until: today },
      total_active_ads: adRows.length,
      summary: {
        recommend_pause: pauseList.length,
        recommend_scale: scaleList.length,
        fatigue_flagged: fatigueList.length,
        still_learning: learnList.length,
        ok_keep_running: okList.length
      },
      pause: pauseList, scale: scaleList, fatigue: fatigueList, learn: learnList, healthy: okList,
      all: adRows
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Daily Health Check ───
// One-pager that flags ad sets which need attention. Read-only, no auto-changes.
// Conditions checked:
//   STUCK    — daily budget ≥ $10 but 24h spend < $1 (Meta refusing delivery)
//   DROPPING — 24h spend < 50% of 7-day average (sudden delivery drop)
//   EXPIRING — lifetime budget end_time within next 3 days
//   IDLE     — daily budget set but 7d spend < 10% of (budget × 7)
app.get('/api/daily-health', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const wk = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

    const adsetsRaw = extractText(await mcpCall('get_adsets', { account_id: AD_ACCOUNT_ID }));
    const all = adsetsRaw?.data || (Array.isArray(adsetsRaw) ? adsetsRaw : []);
    const active = all.filter(a => a.status === 'ACTIVE' || a.effective_status === 'ACTIVE');

    const checks = [];
    let totalSpend24h = 0, totalSpend7d = 0;
    for (const a of active) {
      const dailyB = parseFloat(a.daily_budget || 0) / 100;
      const lifetimeB = parseFloat(a.lifetime_budget || 0) / 100;
      let spend24h = 0, spend7d = 0;
      try {
        const ins24 = extractText(await mcpCall('get_insights', { object_id: a.id, time_range: { since: yest, until: today } }));
        spend24h = (ins24?.data || []).reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
      } catch (e) {}
      try {
        const ins7 = extractText(await mcpCall('get_insights', { object_id: a.id, time_range: { since: wk, until: today } }));
        spend7d = (ins7?.data || []).reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
      } catch (e) {}
      totalSpend24h += spend24h; totalSpend7d += spend7d;
      const avg7d = spend7d / 7;
      const flags = [];
      if (dailyB >= 10 && spend24h < 1) flags.push({ tier: 'STUCK', msg: `daily budget $${dailyB} but only $${spend24h.toFixed(2)} spent yesterday — Meta refusing delivery` });
      if (avg7d > 5 && spend24h < avg7d * 0.5) flags.push({ tier: 'DROPPING', msg: `yesterday $${spend24h.toFixed(2)} vs 7-day avg $${avg7d.toFixed(2)} — ${Math.round(100 * (1 - spend24h / avg7d))}% drop` });
      if (lifetimeB > 0 && a.end_time && a.end_time.slice(0, 10) <= in3) flags.push({ tier: 'EXPIRING', msg: `lifetime budget ends ${a.end_time.slice(0, 10)} — top up or it stops delivery` });
      if (dailyB > 0 && spend7d < dailyB * 7 * 0.1) flags.push({ tier: 'IDLE', msg: `$${dailyB}/day declared but only $${spend7d.toFixed(2)} spent over 7d — barely running` });
      checks.push({ id: a.id, name: a.name, dailyBudget: dailyB, lifetimeBudget: lifetimeB, endTime: a.end_time || null, spend24h, spend7d, avg7d, flags });
    }
    const alerts = checks.filter(c => c.flags.length).sort((a, b) => b.flags.length - a.flags.length);

    // Persist a daily snapshot HTML (also returned in JSON for the tab)
    const reportPath = `${process.cwd()}/db/daily-reports/${today}.html`;
    try {
      if (!existsSync(`${process.cwd()}/db/daily-reports`)) mkdirSync(`${process.cwd()}/db/daily-reports`, { recursive: true });
      const tierColor = { STUCK: '#d33', DROPPING: '#e80', EXPIRING: '#ee0', IDLE: '#888' };
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Sahiba Daily Health ${today}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:780px;margin:1rem auto;padding:1rem;background:#0a0a0a;color:#eee}
h1{color:#e6c46c}h2{color:#e6c46c;border-bottom:1px solid #444;padding-bottom:.3rem}
.k{display:inline-block;margin:.3rem;padding:.5rem .8rem;background:#1a1a1a;border-radius:6px;min-width:140px}
.k .l{font-size:.7rem;color:#888;text-transform:uppercase}.k .v{font-size:1.4rem;font-weight:700}
.alert{margin:.4rem 0;padding:.6rem .8rem;background:#1a1a1a;border-left:4px solid;border-radius:4px}
.tier{display:inline-block;padding:1px 6px;border-radius:3px;font-size:.7rem;font-weight:700;color:#000;margin-right:.5rem}
table{width:100%;border-collapse:collapse;font-size:.85rem}td,th{padding:.3rem .5rem;border-bottom:1px solid #333;text-align:left}</style>
</head><body>
<h1>Sahiba Daily Health — ${today}</h1>
<div><div class="k"><div class="l">Yesterday spend</div><div class="v">$${totalSpend24h.toFixed(2)}</div></div>
<div class="k"><div class="l">7-day spend</div><div class="v">$${totalSpend7d.toFixed(2)}</div></div>
<div class="k"><div class="l">Daily avg (7d)</div><div class="v">$${(totalSpend7d / 7).toFixed(2)}</div></div>
<div class="k"><div class="l">Alerts</div><div class="v" style="color:${alerts.length ? '#f55' : '#5d5'}">${alerts.length}</div></div></div>
<h2>Alerts</h2>${alerts.length ? alerts.map(c => c.flags.map(f => `<div class="alert" style="border-color:${tierColor[f.tier]}"><span class="tier" style="background:${tierColor[f.tier]}">${f.tier}</span><b>${c.name}</b><br>${f.msg}</div>`).join('')).join('') : '<p style="color:#5d5">✓ All ad sets healthy — nothing to do.</p>'}
<h2>All ACTIVE ad sets</h2><table><tr><th>Ad Set</th><th>Daily $</th><th>24h $</th><th>7d $</th><th>Flags</th></tr>${checks.map(c => `<tr><td>${c.name}</td><td>$${c.dailyBudget.toFixed(0)}</td><td>$${c.spend24h.toFixed(2)}</td><td>$${c.spend7d.toFixed(2)}</td><td>${c.flags.map(f => f.tier).join(', ') || '—'}</td></tr>`).join('')}</table>
<p style="color:#666;font-size:.75rem;margin-top:2rem">Generated ${new Date().toISOString()} · No auto-changes made · This is a read-only health check.</p>
</body></html>`;
      writeFileSync(reportPath, html);
    } catch (e) { console.error('report write failed:', e.message); }

    res.json({
      ok: true, date: today,
      totalSpend24h, totalSpend7d, avgDaily7d: totalSpend7d / 7,
      activeCount: active.length, alertCount: alerts.length,
      alerts, all: checks,
      reportPath: reportPath.replace(process.cwd(), '')
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/sales-roi', async (req, res) => {
  try {
    const leadsUrl = setting('sheet_leads_url');
    const salesUrl = setting('sheet_sales_url');
    const rate = parseFloat(setting('mxn_rate', '18')) || 18;
    if (!leadsUrl || !salesUrl) {
      return res.json({ configured: false, message: 'Paste both published CSV URLs in the setup box.' });
    }

    const [leadRows, saleRows] = await Promise.all([fetchCSV(leadsUrl), fetchCSV(salesUrl)]);

    // ── Sheet 2: Leads / attribution ──  NAME, PHONE, CHAT LINK, CAMP ID, AD SET ID, AD ID
    const leadByPhone = {};            // phone -> {camp, adset, ad, name}
    const leadCountByCamp = {};        // campId -> # leads
    let leadTotal = 0;
    for (let i = 1; i < leadRows.length; i++) {
      const r = leadRows[i]; if (!r || r.length < 4) continue;
      const phone = normPhone(r[1]);
      // find the long meta ids (15+ digits) in the row
      const ids = r.map(x => String(x || '').trim()).filter(x => /^\d{15,}$/.test(x));
      const camp = ids[0] || '', adset = ids[1] || '', ad = ids[2] || '';
      if (!phone && !camp) continue;
      leadTotal++;
      if (phone && !leadByPhone[phone]) leadByPhone[phone] = { camp, adset, ad, name: (r[0] || '').trim() };
      if (camp) leadCountByCamp[camp] = (leadCountByCamp[camp] || 0) + 1;
    }

    // ── Sheet 1: Sales log ──  DATE, NAME, PHONE, STATUS(agent|Customer), AMOUNT(MXN), NOTES
    const agentStats = {};   // agent -> {deals, mxn}
    const campSales = {};    // campId -> {deals, mxn}
    let salesTotal = 0, revenueMXN = 0, matched = 0, unmatched = 0;
    const sampleSales = [];
    // Layout (data, not header): DATE | NAME | PHONE | STATUS(agent|Customer) | AMOUNT(MXN) | …
    for (let i = 1; i < saleRows.length; i++) {
      const r = saleRows[i]; if (!r || !r.length) continue;
      const cells = r.map(x => String(x || '').trim());
      const isDate = c => /^\d{4}-\d{2}-\d{2}/.test(c);
      // phone = a cell whose digit-count is 10-13 and is NOT a date
      let phoneIdx = -1;
      for (let j = 0; j < cells.length; j++) {
        if (isDate(cells[j])) continue;
        const d = cells[j].replace(/\D/g, '');
        if (d.length >= 10 && d.length <= 13) { phoneIdx = j; break; }
      }
      const phone = phoneIdx >= 0 ? normPhone(cells[phoneIdx]) : '';
      // agent/status = first non-empty cell after phone
      const status = phoneIdx >= 0 ? (cells.slice(phoneIdx + 1).find(c => c && /[A-Za-z]/.test(c) && !/^https?:/.test(c)) || '') : '';
      // amount = numeric cell after phone that is NOT a date, NOT the phone, plausible (<= 1,000,000)
      let amt = 0;
      for (let j = phoneIdx + 1; j < cells.length; j++) {
        const c = cells[j];
        if (isDate(c)) continue;
        if (/[A-Za-z]/.test(c)) continue;            // skip agent text & notes
        const n = num(c);
        if (n > 0 && n <= 1000000 && c.replace(/\D/g, '') !== cells[phoneIdx]?.replace(/\D/g, '')) { amt = n; break; }
      }
      if (!phone && !amt && !status) continue;
      salesTotal++;
      revenueMXN += amt;
      const agent = /customer/i.test(status) ? 'Unknown' : (status || 'Unknown');
      agentStats[agent] = agentStats[agent] || { deals: 0, mxn: 0 };
      agentStats[agent].deals++; agentStats[agent].mxn += amt;
      const attr = phone ? leadByPhone[phone] : null;
      if (attr && attr.camp) {
        matched++;
        campSales[attr.camp] = campSales[attr.camp] || { deals: 0, mxn: 0 };
        campSales[attr.camp].deals++; campSales[attr.camp].mxn += amt;
      } else unmatched++;
      if (sampleSales.length < 5) sampleSales.push({ phone: phone ? '…' + phone.slice(-4) : '(none)', amt, agent, attributed: !!(attr && attr.camp) });
    }

    // ── Meta spend by campaign (last 90d) ──
    const until = new Date().toISOString().split('T')[0];
    const since = new Date(Date.now() - 90 * 864e5).toISOString().split('T')[0];
    let campSpend = {}, campName = {};
    try {
      const ins = extractText(await mcpCall('get_insights', { object_id: AD_ACCOUNT_ID, level: 'campaign', time_range: { since, until } }));
      const list = ins?.data || (Array.isArray(ins) ? ins : []);
      for (const c of list) { campSpend[c.campaign_id] = parseFloat(c.spend || 0); campName[c.campaign_id] = c.campaign_name; }
    } catch (e) { /* spend optional */ }

    // ── Per-campaign ROI ──
    const campaigns = Object.keys({ ...campSales, ...leadCountByCamp, ...campSpend }).map(id => {
      const s = campSales[id] || { deals: 0, mxn: 0 };
      const spendUSD = campSpend[id] || 0;
      const revUSD = s.mxn / rate;
      const leads = leadCountByCamp[id] || 0;
      return {
        id, name: campName[id] || id,
        leads, sales: s.deals,
        convRate: leads ? (s.deals / leads * 100) : 0,
        revenueUSD: revUSD,
        spendUSD,
        costPerSale: s.deals ? spendUSD / s.deals : null,
        roas: spendUSD ? revUSD / spendUSD : null
      };
    }).filter(c => c.spendUSD > 0 || c.sales > 0 || c.leads > 0)
      .sort((a, b) => (b.roas || -1) - (a.roas || -1));

    const agents = Object.entries(agentStats).map(([name, v]) => ({
      name, deals: v.deals, revenueUSD: v.mxn / rate, avgTicketUSD: v.deals ? (v.mxn / rate / v.deals) : 0
    })).sort((a, b) => b.revenueUSD - a.revenueUSD);

    res.json({
      configured: true,
      rate,
      totals: {
        leads: leadTotal, sales: salesTotal,
        revenueUSD: revenueMXN / rate, revenueMXN,
        matched, unmatched,
        matchRate: salesTotal ? (matched / salesTotal * 100) : 0
      },
      campaigns, agents, sampleSales
    });
  } catch (e) {
    res.status(500).json({ configured: true, error: e.message });
  }
});

// --- Media Library ---
app.get('/api/media', (req, res) => {
  const { type, product, group_name, search } = req.query;
  let query = 'SELECT * FROM media_assets WHERE 1=1';
  const params = [];
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (product) { query += ' AND product = ?'; params.push(product); }
  if (group_name) { query += ' AND group_name = ?'; params.push(group_name); }
  if (search) { query += ' AND (filename LIKE ? OR product LIKE ? OR tags LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  query += ' ORDER BY created_at DESC';
  const assets = all(query, params);
  // Parse JSON fields
  for (const a of assets) {
    try { a.tags = JSON.parse(a.tags || '[]'); } catch { a.tags = []; }
    try { a.used_in_campaigns = JSON.parse(a.used_in_campaigns || '[]'); } catch { a.used_in_campaigns = []; }
  }
  res.json(assets);
});

app.get('/api/media/groups', (req, res) => {
  res.json(all("SELECT group_name, COUNT(*) as count, GROUP_CONCAT(type) as types FROM media_assets WHERE group_name IS NOT NULL AND group_name != '' GROUP BY group_name ORDER BY group_name"));
});

app.get('/api/media/products', (req, res) => {
  res.json(all("SELECT DISTINCT product FROM media_assets WHERE product IS NOT NULL AND product != '' ORDER BY product"));
});

app.get('/api/media/:id', (req, res) => {
  const asset = get('SELECT * FROM media_assets WHERE id = ?', [parseInt(req.params.id)]);
  if (!asset) return res.status(404).json({ error: 'Not found' });
  try { asset.tags = JSON.parse(asset.tags || '[]'); } catch { asset.tags = []; }
  try { asset.used_in_campaigns = JSON.parse(asset.used_in_campaigns || '[]'); } catch { asset.used_in_campaigns = []; }
  res.json(asset);
});

app.post('/api/media', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const ids = [];
  for (const item of items) {
    const { filename, url, type, source, thumbnail_url, product, category, tags, group_name, gdrive_file_id, gdrive_folder_id, file_size, width, height, duration_seconds } = item;
    if (!url) continue;
    const fname = filename || url.split('/').pop() || 'unknown';
    const assetType = type || (fname.match(/\.(mp4|mov|avi|webm)$/i) ? 'video' : 'image');
    // Auto-detect product from filename
    const detectedProduct = product || detectProductFromFilename(fname);
    const lastId = run(`INSERT INTO media_assets (filename, url, type, source, thumbnail_url, product, category, tags, group_name, gdrive_file_id, gdrive_folder_id, file_size, width, height, duration_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fname, url, assetType, source || 'url', thumbnail_url || url, detectedProduct, category || null,
       JSON.stringify(tags || []), group_name || null, gdrive_file_id || null, gdrive_folder_id || null,
       file_size || null, width || null, height || null, duration_seconds || null]);
    ids.push(lastId);
  }
  res.json({ ids, count: ids.length });
});

app.patch('/api/media/:id', (req, res) => {
  const { product, category, tags, group_name } = req.body;
  const updates = [];
  const params = [];
  if (product !== undefined) { updates.push('product = ?'); params.push(product); }
  if (category !== undefined) { updates.push('category = ?'); params.push(category); }
  if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
  if (group_name !== undefined) { updates.push('group_name = ?'); params.push(group_name); }
  if (updates.length === 0) return res.json({ ok: true });
  params.push(parseInt(req.params.id));
  run(`UPDATE media_assets SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
});

app.post('/api/media/bulk-update', (req, res) => {
  const { ids, product, category, tags, group_name } = req.body;
  if (!ids || ids.length === 0) return res.status(400).json({ error: 'No IDs' });
  for (const id of ids) {
    const updates = [];
    const params = [];
    if (product !== undefined) { updates.push('product = ?'); params.push(product); }
    if (category !== undefined) { updates.push('category = ?'); params.push(category); }
    if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }
    if (group_name !== undefined) { updates.push('group_name = ?'); params.push(group_name); }
    if (updates.length > 0) { params.push(id); run(`UPDATE media_assets SET ${updates.join(', ')} WHERE id = ?`, params); }
  }
  res.json({ ok: true });
});

app.delete('/api/media/:id', (req, res) => {
  run('DELETE FROM media_assets WHERE id = ?', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// --- File Upload ---
app.post('/api/media/upload', upload.array('files', 20), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  const ids = [];
  const group_name = req.body.group_name || null;
  const product = req.body.product || null;

  for (const file of req.files) {
    const fname = file.originalname;
    const url = `/uploads/${file.filename}`;
    const assetType = fname.match(/\.(mp4|mov|avi|webm)$/i) ? 'video' : 'image';
    const detectedProduct = product || detectProductFromFilename(fname);

    const lastId = run(`INSERT INTO media_assets (filename, url, type, source, thumbnail_url, product, group_name)
      VALUES (?, ?, ?, 'upload', ?, ?, ?)`,
      [fname, url, assetType, url, detectedProduct, group_name]);
    ids.push(lastId);
  }
  res.json({ ids, count: ids.length, files: req.files.map(f => ({ original: f.originalname, stored: f.filename, size: f.size })) });
});

// Helper: detect product from filename
function detectProductFromFilename(fname) {
  const lower = fname.toLowerCase();
  for (const [kw, info] of Object.entries(PRODUCT_KEYWORDS)) {
    if (lower.includes(kw)) return info.type;
  }
  const codeMatch = lower.match(/(\d{3,4})/);
  if (codeMatch) return `Modelo ${codeMatch[1]}`;
  return null;
}

// --- Google Drive Adapter (interface layer) ---
app.get('/api/gdrive/folders', (req, res) => {
  res.json(all('SELECT * FROM gdrive_sync ORDER BY created_at DESC'));
});

app.post('/api/gdrive/folders', (req, res) => {
  const { folder_id, folder_name } = req.body;
  if (!folder_id) return res.status(400).json({ error: 'folder_id required' });
  run('INSERT INTO gdrive_sync (folder_id, folder_name) VALUES (?, ?) ON CONFLICT DO NOTHING',
    [folder_id, folder_name || folder_id]);
  res.json({ ok: true });
});

app.post('/api/gdrive/import', (req, res) => {
  // Adapter layer — accepts files as if from Google Drive
  // When real Drive API is connected, this will pull from Drive
  // For now, accepts manual file list in same format
  const { folder_id, files } = req.body;
  if (!files || files.length === 0) return res.status(400).json({ error: 'No files to import' });

  const ids = [];
  for (const file of files) {
    const fname = file.name || file.filename || 'gdrive_file';
    const url = file.webContentLink || file.url || '';
    const thumbUrl = file.thumbnailLink || file.thumbnail_url || url;
    const assetType = fname.match(/\.(mp4|mov|avi|webm)$/i) ? 'video' : 'image';
    const detectedProduct = detectProductFromFilename(fname);

    run(`INSERT INTO media_assets (filename, url, type, source, thumbnail_url, product, gdrive_file_id, gdrive_folder_id)
      VALUES (?, ?, ?, 'gdrive', ?, ?, ?, ?)`,
      [fname, url, assetType, thumbUrl, detectedProduct, file.id || null, folder_id || null]);
    const last = get("SELECT last_insert_rowid() as id");
    ids.push(last?.id);
  }

  if (folder_id) {
    run("UPDATE gdrive_sync SET last_synced_at = datetime('now') WHERE folder_id = ?", [folder_id]);
  }

  res.json({ ids, count: ids.length });
});

// --- Sync ---
app.post('/api/sync', async (req, res) => {
  try { await syncFromPipeboard(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Pipeboard proxy ---
app.post('/api/pipeboard/:tool', async (req, res) => {
  try {
    const result = await mcpCall(req.params.tool, { account_id: AD_ACCOUNT_ID, ...req.body });
    res.json(extractText(result));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ PHASE 3: AI COPY GENERATION ═══
const COPY_TEMPLATES = {
  BEACHFRONT: {
    hooks: [
      '{{product}} para tu boutique en {{city}} — tus clientas lo van a amar',
      'Lo más vendido en zonas turísticas: {{product}} al por mayor',
      'Vende {{product}} en {{city}} — margen alto, envío rápido',
      'Boutiques en {{city}}: {{product}} desde ${{price}} MXN por mayoreo'
    ],
    primary: [
      'Somos fabricantes de {{product}} y enviamos a todo México. Pide tu catálogo GRATIS por WhatsApp y empieza a vender con márgenes del 60-80%. Envío en 3-5 días a {{city}}.',
      'Tu boutique en {{city}} merece lo mejor. {{product}} al por mayor directo de fábrica. Catálogo gratis + precios exclusivos por WhatsApp. ¡Escríbenos hoy!',
      '¿Tienes boutique o vendes por redes en {{city}}? {{product}} de alta calidad a precio de mayoreo. Pide tu catálogo por WhatsApp — sin compromiso.'
    ],
    headlines: [
      'Catálogo GRATIS por WhatsApp',
      'Mayoreo desde ${{price}} MXN',
      'Envío a {{city}} en 3-5 días',
      'Directo de fábrica — máximo margen'
    ],
    ctas: ['WHATSAPP_MESSAGE', 'LEARN_MORE', 'SHOP_NOW']
  },
  WHOLESALE: {
    hooks: [
      '{{product}} al mayoreo — precio de fábrica para tu negocio en {{city}}',
      'Comerciantes de {{city}}: {{product}} con el mejor margen',
      '{{product}} para reventa — catálogo gratis por WhatsApp',
      'Precio especial de mayoreo: {{product}} desde ${{price}} MXN'
    ],
    primary: [
      'Somos fabricantes de {{product}}. Precios de mayoreo desde ${{price}} MXN. Envío a {{city}} en 3-5 días. Pide tu catálogo GRATIS por WhatsApp.',
      'Si vendes ropa en {{city}}, tenemos {{product}} a precio de fábrica. Mínimo 100 piezas. Catálogo y lista de precios por WhatsApp — escríbenos.',
      '{{product}} directo de fábrica para comerciantes en {{city}}. Margen garantizado del 50%+. Escríbenos por WhatsApp para recibir catálogo y precios.'
    ],
    headlines: [
      'Mayoreo desde ${{price}} MXN',
      'Catálogo GRATIS',
      'Mínimo 100 piezas',
      'Precio de fábrica directo'
    ],
    ctas: ['WHATSAPP_MESSAGE', 'GET_QUOTE', 'CONTACT_US']
  },
  TESTING: {
    hooks: [
      '{{product}} al mayoreo — precio de fábrica',
      'Vende {{product}} con margen del 60%+',
      '{{product}} por mayoreo — catálogo gratis por WhatsApp',
      'Emprende vendiendo {{product}} — te damos todo'
    ],
    primary: [
      '¿Quieres emprender vendiendo ropa? {{product}} al por mayor desde ${{price}} MXN. Te enviamos catálogo GRATIS por WhatsApp. ¡Empieza hoy!',
      '{{product}} de alta calidad a precio de mayoreo. Envío a todo México. Pide tu catálogo por WhatsApp — sin compromiso, sin mínimo para ver precios.',
      'Fabricamos {{product}} y vendemos al por mayor. Si tienes boutique o vendes por redes, escríbenos por WhatsApp para catálogo y precios exclusivos.'
    ],
    headlines: [
      'Catálogo GRATIS',
      'Desde ${{price}} MXN mayoreo',
      'Envío a todo México',
      'Emprende vendiendo moda'
    ],
    ctas: ['WHATSAPP_MESSAGE', 'LEARN_MORE']
  },
  RETARGET: {
    hooks: [
      '¿Todavía buscas {{product}}? Aquí están tus precios de mayoreo',
      'No te quedes sin {{product}} — precios especiales hoy',
      '{{product}} — tu catálogo te está esperando',
      'Regresa y pide tu catálogo GRATIS de {{product}}'
    ],
    primary: [
      '¡Vimos que te interesó {{product}}! No te quedes sin tu catálogo GRATIS. Escríbenos por WhatsApp y te lo mandamos al momento. Precios de mayoreo desde ${{price}} MXN.',
      'Tu catálogo de {{product}} te está esperando. Precios de mayoreo + envío rápido a todo México. Escríbenos hoy por WhatsApp.',
      '¿Sigues interesado/a en {{product}}? Te damos precio especial si escribes hoy. Catálogo GRATIS por WhatsApp — mándanos mensaje.'
    ],
    headlines: [
      'Tu catálogo te espera',
      'Precio especial hoy',
      'Escríbenos por WhatsApp',
      'No te lo pierdas'
    ],
    ctas: ['WHATSAPP_MESSAGE', 'SHOP_NOW']
  }
};

function fillTemplate(template, vars) {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val || '');
  }
  return result;
}

function generateCopy(type, product, city, price) {
  const templates = COPY_TEMPLATES[type] || COPY_TEMPLATES.TESTING;
  const vars = { product, city: city || '', price: price || '130' };
  return {
    hooks: templates.hooks.map(h => fillTemplate(h, vars)),
    primaryTexts: templates.primary.map(p => fillTemplate(p, vars)),
    headlines: templates.headlines.map(h => fillTemplate(h, vars)),
    ctas: templates.ctas
  };
}

// ═══ NAMING CONVENTION ═══
function generateCampaignName(type, city, product) {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const cleanCity = (city || 'National').replace(/\s+/g, '');
  const cleanProduct = (product || 'General').replace(/\s+/g, '');
  return `MX_WhatsApp_${type}_${cleanCity}_${cleanProduct}_${date}`;
}

function generateAdSetName(type, city, product, variant) {
  const cleanCity = (city || 'National').replace(/\s+/g, '');
  return `${type}_${cleanCity}_${product}_Set${variant}`;
}

function generateAdName(type, city, product, adNum) {
  return `${type}_${city || 'National'}_${product}_Ad${adNum}`;
}

// ═══ BUDGET ALLOCATION ═══
const BUDGET_MAP = {
  BEACHFRONT: { daily: 25, description: 'Highest — tourist/reseller areas' },
  RETARGET:   { daily: 20, description: 'High ROI — warm audiences' },
  WHOLESALE:  { daily: 15, description: 'Medium — established markets' },
  TESTING:    { daily: 10, description: 'Low — new/unproven markets' }
};

function getAllocatedBudget(type) {
  return BUDGET_MAP[type] || BUDGET_MAP.TESTING;
}

// ═══ BULK CAMPAIGN GENERATION ═══
function generateBulkCampaigns(product, price, cities, mediaUrls, whatsappLink) {
  const campaigns = [];

  for (const cityConfig of cities) {
    const { city, type } = cityConfig;
    const budget = getAllocatedBudget(type);
    const copy = generateCopy(type, product, city, price);
    const campaignName = generateCampaignName(type, city, product);

    const adsets = [];
    // Generate 2-3 ad sets per campaign (different audience angles)
    const audienceAngles = type === 'RETARGET'
      ? [{ name: 'Retarget_Engaged', desc: 'Users who engaged but did not convert' }]
      : [
          { name: 'Interests_Fashion', desc: 'Fashion & clothing interests' },
          { name: 'Interests_Business', desc: 'Small business & entrepreneurship' },
          { name: 'Broad_Women', desc: 'Broad women 25-55' }
        ];

    audienceAngles.forEach((angle, setIdx) => {
      const adsetName = generateAdSetName(type, city, product, setIdx + 1);
      const ads = [];

      // Generate 2-3 ads per ad set
      const adCount = Math.min(mediaUrls.length || 2, 3);
      for (let adIdx = 0; adIdx < adCount; adIdx++) {
        const adName = generateAdName(type, city, product, adIdx + 1);
        ads.push({
          name: adName,
          status: 'PAUSED',
          creative: {
            image_url: mediaUrls[adIdx] || null,
            message: copy.primaryTexts[adIdx % copy.primaryTexts.length],
            headline: copy.headlines[adIdx % copy.headlines.length],
            hook: copy.hooks[adIdx % copy.hooks.length],
            cta: copy.ctas[adIdx % copy.ctas.length],
            link: whatsappLink || ''
          }
        });
      }

      adsets.push({
        name: adsetName,
        status: 'PAUSED',
        optimization_goal: 'LINK_CLICKS',
        billing_event: 'IMPRESSIONS',
        daily_budget: budget.daily,
        audience: angle,
        ads
      });
    });

    campaigns.push({
      name: campaignName,
      type,
      city,
      product,
      objective: 'OUTCOME_ENGAGEMENT',
      status: 'PAUSED',
      daily_budget: budget.daily,
      budget_description: budget.description,
      special_ad_categories: [],
      adsets,
      copy
    });
  }

  return campaigns;
}

// ═══ IMPROVED AI LABELS (Step 5) ═══
function computeAiLabelV2(campaign, insights, funnelData) {
  if (!insights) return 'MONITOR';
  const spend = parseFloat(insights.spend) || 0;
  const clicks = parseInt(insights.clicks) || 0;
  const ctr = parseFloat(insights.ctr) || 0;
  const frequency = parseFloat(insights.frequency) || 0;
  const linkClicks = parseInt(insights.link_clicks) || 0;

  if (campaign.status === 'PAUSED') return 'PAUSE';

  // High spend, no results
  if (spend > 30 && clicks < 3) return 'FIX';
  if (spend > 20 && linkClicks === 0) return 'FIX';

  // Creative fatigue
  if (frequency > 3.5) return 'FIX';

  // Strong performer
  if (ctr > 3 && spend > 5) return 'SCALE';
  if (ctr > 2 && linkClicks > 10) return 'SCALE';

  // Decent but watch
  if (ctr > 1 && spend > 0) return 'MONITOR';

  // Underperforming
  if (spend > 15 && ctr < 0.5) return 'FIX';
  if (spend > 10 && ctr < 1) return 'MONITOR';

  return 'MONITOR';
}

// ═══ DAILY AI REPORT (Step 6) ═══
function generateDailyReport() {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  // Campaign performance
  const campPerf = all(`
    SELECT c.meta_id, c.name, c.status, c.category, c.ai_label,
      COALESCE(SUM(i.spend), 0) as spend, COALESCE(SUM(i.clicks), 0) as clicks,
      COALESCE(SUM(i.link_clicks), 0) as link_clicks,
      COALESCE(AVG(i.ctr), 0) as ctr, COALESCE(AVG(i.frequency), 0) as frequency,
      COALESCE(AVG(i.cpc), 0) as cpc
    FROM campaigns c
    LEFT JOIN insights_daily i ON i.campaign_meta_id = c.meta_id
    GROUP BY c.meta_id ORDER BY spend DESC
  `);

  // Winners: Active + high CTR + reasonable spend
  const winners = campPerf
    .filter(c => c.status === 'ACTIVE' && c.ctr > 2 && c.spend > 5)
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 3);

  // Losers: Active + high spend + low CTR or no link clicks
  const losers = campPerf
    .filter(c => c.status === 'ACTIVE' && c.spend > 10 && (c.ctr < 1 || c.link_clicks < 3))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 3);

  // Funnel data
  const totalSpend = campPerf.reduce((s, c) => s + c.spend, 0);
  const totalClicks = campPerf.reduce((s, c) => s + c.clicks, 0);
  const totalLinkClicks = campPerf.reduce((s, c) => s + c.link_clicks, 0);
  const conversations = (get("SELECT COUNT(*) as c FROM funnel_events WHERE event_type = 'conversation_start'") || {}).c || 0;
  const qualifiedLeads = (get("SELECT COUNT(*) as c FROM leads WHERE stage IN ('warm','hot','customer')") || {}).c || 0;
  const sales = (get("SELECT COUNT(*) as c FROM sales") || {}).c || 0;

  // Bottlenecks
  const bottlenecks = [];
  if (totalLinkClicks > 50 && conversations < totalLinkClicks * 0.1) {
    bottlenecks.push('Low click-to-conversation rate — WhatsApp landing may need optimization');
  }
  if (conversations > 10 && qualifiedLeads < conversations * 0.2) {
    bottlenecks.push('Low conversation-to-lead rate — agents may need better qualifying scripts');
  }
  if (qualifiedLeads > 5 && sales < qualifiedLeads * 0.1) {
    bottlenecks.push('Low lead-to-sale rate — follow-up process needs improvement');
  }
  const highFreq = campPerf.filter(c => c.frequency > 3);
  if (highFreq.length > 0) {
    bottlenecks.push(`${highFreq.length} campaign(s) with high frequency (>3x) — creative fatigue risk`);
  }
  if (bottlenecks.length === 0) {
    bottlenecks.push('No major bottlenecks detected');
  }

  // Actions
  const actions = [];
  if (losers.length > 0) actions.push(`Pause or fix ${losers.length} underperforming campaign(s): ${losers.map(l => l.name).join(', ')}`);
  if (winners.length > 0) actions.push(`Increase budget on top performer: "${winners[0]?.name}" (CTR: ${winners[0]?.ctr?.toFixed(1)}%)`);
  if (highFreq.length > 0) actions.push(`Refresh creatives for: ${highFreq.map(c => c.name).join(', ')}`);
  if (actions.length === 0) actions.push('Monitor current campaigns — no urgent actions needed');
  while (actions.length < 3) actions.push('Review and update ad creatives for freshness');

  // Tests
  const tests = [
    'Test video creative vs. image for top campaign',
    'Test "Send WhatsApp Message" CTA vs "Learn More"',
    'Test narrower age range (25-35) for beachfront campaigns'
  ];

  return {
    date: today,
    summary: {
      total_spend: totalSpend,
      total_clicks: totalClicks,
      total_link_clicks: totalLinkClicks,
      conversations,
      qualified_leads: qualifiedLeads,
      sales,
      active_campaigns: campPerf.filter(c => c.status === 'ACTIVE').length,
      paused_campaigns: campPerf.filter(c => c.status === 'PAUSED').length
    },
    winners: winners.map(w => ({ name: w.name, spend: w.spend, ctr: w.ctr, link_clicks: w.link_clicks, label: w.ai_label })),
    losers: losers.map(l => ({ name: l.name, spend: l.spend, ctr: l.ctr, link_clicks: l.link_clicks, label: l.ai_label })),
    bottlenecks,
    actions: actions.slice(0, 3),
    tests: tests.slice(0, 3),
    campaigns: campPerf
  };
}

// ═══ PHASE 3 API ENDPOINTS ═══

// --- Bulk Campaign Generator ---
// --- AI Product Detection ---
const PRODUCT_KEYWORDS = {
  'vestido': { type: 'Vestido', price: '130', en: 'Dress' },
  'dress': { type: 'Vestido', price: '130', en: 'Dress' },
  'blusa': { type: 'Blusa', price: '95', en: 'Blouse' },
  'blouse': { type: 'Blusa', price: '95', en: 'Blouse' },
  'top': { type: 'Top', price: '85', en: 'Top' },
  'falda': { type: 'Falda', price: '110', en: 'Skirt' },
  'skirt': { type: 'Falda', price: '110', en: 'Skirt' },
  'conjunto': { type: 'Conjunto', price: '180', en: 'Set' },
  'set': { type: 'Conjunto', price: '180', en: 'Set' },
  'pantalón': { type: 'Pantalón', price: '120', en: 'Pants' },
  'pants': { type: 'Pantalón', price: '120', en: 'Pants' },
  'jumpsuit': { type: 'Jumpsuit', price: '160', en: 'Jumpsuit' },
  'maxi': { type: 'Vestido Maxi', price: '150', en: 'Maxi Dress' },
  'mini': { type: 'Vestido Mini', price: '120', en: 'Mini Dress' },
  'kimono': { type: 'Kimono', price: '100', en: 'Kimono' },
  'cardigan': { type: 'Cardigan', price: '110', en: 'Cardigan' },
  'plus': { type: 'Talla Extra', price: '140', en: 'Plus Size' },
  'extra': { type: 'Talla Extra', price: '140', en: 'Plus Size' },
  'playa': { type: 'Ropa de Playa', price: '120', en: 'Beachwear' },
  'beach': { type: 'Ropa de Playa', price: '120', en: 'Beachwear' },
  'lencería': { type: 'Lencería', price: '90', en: 'Lingerie' },
  'encaje': { type: 'Blusa Encaje', price: '105', en: 'Lace Blouse' },
  'lace': { type: 'Blusa Encaje', price: '105', en: 'Lace Blouse' },
  'bordado': { type: 'Bordado', price: '145', en: 'Embroidered' },
  'sari': { type: 'Sari', price: '200', en: 'Sari' },
  'kurta': { type: 'Kurta', price: '150', en: 'Kurta' },
};

function detectProduct(filename, userHint) {
  // Check user hint first
  if (userHint) {
    const lower = userHint.toLowerCase();
    for (const [kw, info] of Object.entries(PRODUCT_KEYWORDS)) {
      if (lower.includes(kw)) return { ...info, source: 'user_hint', confidence: 'high' };
    }
    return { type: userHint, price: '130', en: userHint, source: 'user_hint', confidence: 'medium' };
  }
  // Check filename
  if (filename) {
    const lower = filename.toLowerCase();
    for (const [kw, info] of Object.entries(PRODUCT_KEYWORDS)) {
      if (lower.includes(kw)) return { ...info, source: 'filename', confidence: 'high' };
    }
    // Try to extract a product code pattern like "517" or "ABC123"
    const codeMatch = lower.match(/(\d{3,4})/);
    if (codeMatch) return { type: `Modelo ${codeMatch[1]}`, price: '130', en: `Model ${codeMatch[1]}`, source: 'filename_code', confidence: 'medium' };
  }
  return { type: 'Ropa de Mujer', price: '130', en: 'Women\'s Clothing', source: 'default', confidence: 'low' };
}

// Default cities per campaign type for auto-generation
// ═══ MASTER CITY DATABASE v2.0 (source of truth) ═══
const CITY_TIERS = {
  METRO_T1: { label: 'Metropolitan Tier 1', segment: 'metropolitan', tier: 1, default: true, budget_usd: 35, cities: [
    { name: 'CDMX', key: '2673660', radius: 20 },
    { name: 'Guadalajara', key: '1522110', radius: 15 },
    { name: 'Monterrey', key: '1536363', radius: 15 },
    { name: 'Veracruz', key: '1559085', radius: 15 },
    { name: 'Oaxaca City', key: '1537775', radius: 20 }
  ]},
  METRO_T2: { label: 'Metropolitan Tier 2', segment: 'metropolitan', tier: 2, default: true, budget_usd: 20, cities: [
    { name: 'Puebla', key: '1542028', radius: 20 },
    { name: 'León', key: '1531557', radius: 20 },
    { name: 'Querétaro', key: '1542608', radius: 20 },
    { name: 'Toluca', key: '1557546', radius: 20 },
    { name: 'San Luis Potosí', key: '1550499', radius: 20 }
  ]},
  BEACH_T1: { label: 'Beach Tier 1', segment: 'beach', tier: 1, default: true, budget_usd: 30, cities: [
    { name: 'Cancún', key: '1508006', radius: 15 },
    { name: 'Playa del Carmen', key: '1540930', radius: 10 },
    { name: 'Tulum', key: '1558246', radius: 10 },
    { name: 'Puerto Vallarta', key: '1542382', radius: 15 },
    { name: 'Mazatlán', key: '1535012', radius: 15 }
  ]},
  BEACH_T2: { label: 'Beach Tier 2', segment: 'beach', tier: 2, default: true, budget_usd: 15, cities: [
    { name: 'Los Cabos', key: '688614', radius: 15 },
    { name: 'Acapulco', key: '1502429', radius: 15 },
    { name: 'Cozumel', key: '1550858', radius: 10 },
    { name: 'Isla Mujeres', key: '1524168', radius: 10 },
    { name: 'Huatulco', key: '1523448', radius: 15 }
  ]}
};

const TOTAL_DAILY_BUDGET_CAP = 100; // USD

// City tier info endpoint
app.get('/api/city-tiers', (req, res) => res.json(CITY_TIERS));

function buildCityList(tiers, includeRetarget = true) {
  const cities = [];
  const activeTiers = tiers || Object.keys(CITY_TIERS).filter(k => CITY_TIERS[k].default);

  for (const tierKey of activeTiers) {
    const tier = CITY_TIERS[tierKey];
    if (!tier) continue;
    for (const city of tier.cities) {
      cities.push({ city: city.name, radius: city.radius, type: tier.type, tier: tierKey });
    }
  }
  if (includeRetarget) {
    cities.push({ city: 'National', radius: 0, type: 'RETARGET', tier: 'RETARGET' });
  }
  return cities;
}

// Legacy compat
const AUTO_CITIES = {
  BEACHFRONT: ['Cancún', 'Playa del Carmen', 'Tulum', 'Puerto Vallarta', 'Los Cabos', 'Mazatlán', 'Acapulco'],
  WHOLESALE: ['CDMX', 'Guadalajara', 'Monterrey', 'Puebla', 'León', 'Querétaro', 'Toluca', 'Veracruz', 'Oaxaca City', 'Mérida', 'San Luis Potosí'],
  TESTING: ['Aguascalientes', 'Tuxtla Gutiérrez', 'Villahermosa', 'Culiacán', 'Hermosillo', 'Chihuahua', 'Saltillo', 'Morelia'],
  RETARGET: ['National']
};

// --- AI Auto-Generate v2.0 (config-driven) ---
app.post('/api/ai-generate', (req, res) => {
  const { asset_ids, media_urls, filenames, product_hint, price_hint, creative_mode,
          tiers, ads_per_adset, assets_per_ad, total_budget } = req.body;
  const requestedAdsPerAdset = Math.max(1, Math.min(parseInt(ads_per_adset) || 3, 10));
  const requestedAssetsPerAd = Math.max(1, Math.min(parseInt(assets_per_ad) || 1, 5));
  const budgetCap = Math.min(parseFloat(total_budget) || TOTAL_DAILY_BUDGET_CAP, 200);

  // Resolve assets — from library IDs or direct URLs
  let assets = [];
  if (asset_ids && asset_ids.length > 0) {
    const placeholders = asset_ids.map(() => '?').join(',');
    assets = all(`SELECT * FROM media_assets WHERE id IN (${placeholders})`, asset_ids);
    for (const a of assets) { try { a.tags = JSON.parse(a.tags || '[]'); } catch { a.tags = []; } }
  }
  if (media_urls && media_urls.length > 0) {
    media_urls.forEach((url, i) => {
      assets.push({ id: null, url, filename: filenames?.[i] || url.split('/').pop(), type: url.match(/\.(mp4|mov|avi|webm)$/i) ? 'video' : 'image', product: null });
    });
  }

  if (assets.length === 0) return res.status(400).json({ error: 'Select at least one media asset' });

  const images = assets.filter(a => a.type === 'image');
  const videos = assets.filter(a => a.type === 'video');

  // Creative mode filtering
  const mode = creative_mode || 'all';
  let activeAssets = assets;
  if (mode === 'images_only') activeAssets = images;
  else if (mode === 'videos_only') activeAssets = videos;
  else if (mode === 'best_3') activeAssets = assets.slice(0, 3);

  const activeImages = activeAssets.filter(a => a.type === 'image');
  const activeVideos = activeAssets.filter(a => a.type === 'video');

  // Get WhatsApp link
  const whatsappSetting = get("SELECT value FROM settings WHERE key = 'whatsapp_link'");
  const whatsappLink = whatsappSetting?.value || '';

  // Product detection from all assets
  const allFilenames = assets.map(a => a.filename || '');
  const allProducts = assets.map(a => a.product).filter(Boolean);
  const productCounts = {};
  for (const p of allProducts) { productCounts[p] = (productCounts[p] || 0) + 1; }
  const topProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const mainFilename = allFilenames[0] || '';
  const detected = detectProduct(mainFilename, product_hint || topProduct);
  const product = detected.type;
  const price = price_hint || detected.price;

  // Check if assets belong to same product family
  const uniqueProducts = [...new Set(allProducts.filter(Boolean))];
  const sameFamily = uniqueProducts.length <= 1;

  // ═══ CAMPAIGN GENERATION v2.0 ═══
  // 1 campaign → N ad sets (by tier) → N ads per ad set → N assets per ad (carousel)

  // Active tiers
  let activeTiers = tiers && tiers.length > 0
    ? tiers
    : Object.keys(CITY_TIERS).filter(k => CITY_TIERS[k].default);

  // Calculate proportional budgets within cap
  const totalTierBudget = activeTiers.reduce((s, t) => s + (CITY_TIERS[t]?.budget_usd || 0), 0);
  const budgetScale = totalTierBudget > 0 ? Math.min(budgetCap / totalTierBudget, 1) : 1;

  // Naming
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const cleanProduct = (product || 'General').replace(/\s+/g, '');
  const copy = generateCopy('WHOLESALE', product, 'México', price);

  // Build ad sets
  const adsets = [];
  for (const tierKey of activeTiers) {
    const tier = CITY_TIERS[tierKey];
    if (!tier) continue;

    const tierBudget = Math.round(tier.budget_usd * budgetScale * 100) / 100;
    const adsetName = `${tier.segment}_T${tier.tier}_${cleanProduct}`;
    const cityNames = tier.cities.map(c => c.name).join(', ');

    // Build ads — each ad gets N assets (carousel support)
    const ads = [];
    for (let adIdx = 0; adIdx < requestedAdsPerAdset; adIdx++) {
      const adName = `${cleanProduct}_Ad${adIdx + 1}`;

      // Assign assets to this ad (carousel = multiple assets per ad)
      const adAssets = [];
      for (let assetIdx = 0; assetIdx < requestedAssetsPerAd; assetIdx++) {
        const globalIdx = (adIdx * requestedAssetsPerAd + assetIdx) % activeAssets.length;
        adAssets.push(activeAssets[globalIdx]);
      }

      ads.push({
        name: adName,
        status: 'PAUSED',
        format: requestedAssetsPerAd > 1 ? 'carousel' : 'single',
        assets: adAssets.map(a => ({
          id: a.id,
          url: a.url,
          type: a.type,
          filename: a.filename
        })),
        creative: {
          message: copy.primaryTexts[adIdx % copy.primaryTexts.length],
          headline: copy.headlines[adIdx % copy.headlines.length],
          hook: copy.hooks[adIdx % copy.hooks.length],
          cta: copy.ctas[adIdx % copy.ctas.length],
          link: whatsappLink
        }
      });
    }

    adsets.push({
      name: adsetName,
      tier: tierKey,
      tier_label: tier.label,
      segment: tier.segment,
      status: 'PAUSED',
      optimization_goal: 'CONVERSATIONS',
      billing_event: 'IMPRESSIONS',
      daily_budget: tierBudget,
      cities: tier.cities,
      cities_summary: cityNames,
      cities_count: tier.cities.length,
      audience: { desc: `Mujeres 25+, Español — ${cityNames}` },
      ads
    });
  }

  const totalDailyBudget = adsets.reduce((s, a) => s + a.daily_budget, 0);
  const totalAds = adsets.reduce((s, a) => s + a.ads.length, 0);
  const totalAssetsUsed = adsets.reduce((s, a) => s + a.ads.reduce((s2, ad) => s2 + ad.assets.length, 0), 0);

  const campaignName = `MX_WhatsApp_${adsets[0]?.segment || 'all'}_T1_${cleanProduct}_${date}`;

  const campaign = {
    name: campaignName,
    product,
    objective: 'OUTCOME_ENGAGEMENT',
    status: 'PAUSED',
    daily_budget: totalDailyBudget,
    special_ad_categories: [],
    adsets,
    copy,
    targeting_summary: `Mujeres 25+, Español, ${adsets.length} ad sets, ${totalAds} ads`
  };

  // Duplicate check
  const duplicateWarnings = [];
  for (const asset of assets) {
    let usedIn = asset.used_in_campaigns;
    if (typeof usedIn === 'string') { try { usedIn = JSON.parse(usedIn); } catch { usedIn = []; } }
    if (Array.isArray(usedIn) && usedIn.length > 0) {
      duplicateWarnings.push(`"${asset.filename}" ya se usó en ${usedIn.length} campaña(s)`);
    }
  }

  // Validate budget cap
  if (totalDailyBudget > budgetCap) {
    return res.status(400).json({ error: `Presupuesto total ($${totalDailyBudget}) excede el límite ($${budgetCap})` });
  }

  res.json({
    detected_product: detected,
    product, price, whatsapp_link: whatsappLink,
    same_product_family: sameFamily,
    creative_mode: mode,
    media_summary: { total: assets.length, images: images.length, videos: videos.length, ig_posts: assets.filter(a => a.type === 'ig_post').length, active: activeAssets.length },
    campaign,
    total_campaigns: 1,
    total_adsets: adsets.length,
    total_ads: totalAds,
    total_assets_used: totalAssetsUsed,
    total_daily_budget: totalDailyBudget,
    budget_cap: budgetCap,
    active_tiers: activeTiers,
    ads_per_adset: requestedAdsPerAdset,
    assets_per_ad: requestedAssetsPerAd,
    ad_format: requestedAssetsPerAd > 1 ? 'carousel' : 'single',
    targeting: { age: '25-65', gender: 'Mujeres', language: 'Solo Español', objective: 'Engagement' },
    duplicate_warnings: duplicateWarnings,
    assets_used: assets.map(a => ({ id: a.id, filename: a.filename, type: a.type, url: a.url }))
  });
});

function buildAd(type, city, product, adNum, asset, copy, link) {
  return {
    name: generateAdName(type, city, product, adNum),
    status: 'PAUSED',
    media_asset_id: asset.id,
    creative: {
      image_url: asset.type === 'image' ? asset.url : null,
      video_url: asset.type === 'video' ? asset.url : null,
      thumbnail_url: asset.thumbnail_url || asset.url,
      media_type: asset.type,
      message: copy.primaryTexts[(adNum - 1) % copy.primaryTexts.length],
      headline: copy.headlines[(adNum - 1) % copy.headlines.length],
      hook: copy.hooks[(adNum - 1) % copy.hooks.length],
      cta: copy.ctas[(adNum - 1) % copy.ctas.length],
      link: link
    }
  };
}

function buildAdVariant(type, city, product, adNum, asset, copy, variantIdx, link) {
  return {
    name: generateAdName(type, city, product, adNum) + `_v${variantIdx + 1}`,
    status: 'PAUSED',
    media_asset_id: asset.id,
    creative: {
      image_url: asset.type === 'image' ? asset.url : null,
      video_url: asset.type === 'video' ? asset.url : null,
      thumbnail_url: asset.thumbnail_url || asset.url,
      media_type: asset.type,
      message: copy.primaryTexts[variantIdx % copy.primaryTexts.length],
      headline: copy.headlines[variantIdx % copy.headlines.length],
      hook: copy.hooks[variantIdx % copy.hooks.length],
      cta: copy.ctas[variantIdx % copy.ctas.length],
      link: link
    }
  };
}

// --- Legacy bulk-generate (still works for advanced mode) ---
app.post('/api/bulk-generate', (req, res) => {
  const { product, price, cities, media_urls, whatsapp_link } = req.body;
  if (!product || !cities || cities.length === 0) {
    return res.status(400).json({ error: 'Product and at least one city/type are required' });
  }
  const whatsappSetting = get("SELECT value FROM settings WHERE key = 'whatsapp_link'");
  const link = whatsapp_link || whatsappSetting?.value || '';
  const campaigns = generateBulkCampaigns(product, price || '130', cities, media_urls || [], link);
  res.json({ campaigns, total_campaigns: campaigns.length, total_adsets: campaigns.reduce((s, c) => s + c.adsets.length, 0), total_ads: campaigns.reduce((s, c) => s + c.adsets.reduce((s2, a) => s2 + a.ads.length, 0), 0) });
});

// --- Publish Draft Campaigns to Meta ---
app.post('/api/bulk-publish', async (req, res) => {
  // Accept either { campaign } (new single-campaign) or { campaigns } (legacy array)
  let campaignList = req.body.campaigns;
  if (!campaignList && req.body.campaign) campaignList = [req.body.campaign];
  if (!campaignList || campaignList.length === 0) return res.status(400).json({ error: 'No campaigns to publish' });

  // ═══ HARD POLICY GUARD — Sahiba runs IG-first ═══
  // Reject the WHOLE request up-front if any ad lacks object_story_id (= existing IG post).
  // This prevents creating orphan campaigns/ad sets on Meta before the per-ad guard fires.
  // See memory: project_instagram_first_workflow.md.
  const bad = [];
  for (const camp of campaignList) {
    for (const adset of (camp.adsets || [])) {
      for (const ad of (adset.ads || [])) {
        if (!ad.object_story_id) bad.push(`${camp.name || 'unnamed-campaign'} → ${adset.name || 'unnamed-adset'} → ${ad.name || 'unnamed-ad'}`);
      }
    }
  }
  if (bad.length) return res.status(400).json({
    error: 'SAHIBA POLICY: every ad must reference an existing Instagram post (object_story_id). Raw image/video ads are not allowed. Use the Promote IG tab.',
    offenders: bad
  });

  // Get page_id from settings or fetch it
  let pageId = null;
  const pageSetting = get("SELECT value FROM settings WHERE key = 'page_id'");
  if (pageSetting?.value) {
    pageId = pageSetting.value;
  } else {
    try {
      const pagesResult = extractText(await mcpCall('get_account_pages', { account_id: AD_ACCOUNT_ID }));
      if (pagesResult?.data?.[0]?.id) {
        pageId = pagesResult.data[0].id;
        run("INSERT INTO settings (key, value) VALUES ('page_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [pageId]);
      }
    } catch (e) { console.log('  Could not fetch page_id:', e.message); }
  }

  const results = [];
  for (const camp of campaignList) {
    try {
      // 1. Create campaign on Meta
      console.log(`  Publishing campaign: ${camp.name}`);
      // Create campaign WITHOUT budget — use Ad Set Budget (ABO) not Campaign Budget (CBO)
      // This matches how your working campaigns are set up
      const campResult = extractText(await mcpCall('create_campaign', {
        account_id: AD_ACCOUNT_ID,
        name: camp.name,
        objective: camp.objective || 'OUTCOME_ENGAGEMENT',
        status: 'PAUSED',
        special_ad_categories: camp.special_ad_categories || [],
        use_adset_level_budgets: true
      }));
      const campaignId = campResult?.id;
      if (!campaignId) { results.push({ name: camp.name, error: 'Failed to create campaign: ' + JSON.stringify(campResult) }); continue; }
      console.log(`    Campaign created: ${campaignId}`);

      run(`INSERT INTO campaigns (meta_id, name, objective, status, category, daily_budget, updated_at)
        VALUES (?, ?, ?, 'PAUSED', 'UNCATEGORIZED', ?, datetime('now'))
        ON CONFLICT(meta_id) DO UPDATE SET name=excluded.name, updated_at=datetime('now')`,
        [campaignId, camp.name, camp.objective, camp.daily_budget]);

      // 2. Create ad sets
      const adsetResults = [];
      for (const adset of (camp.adsets || [])) {
        try {
          // Build proper targeting for Meta API with real city keys
          const adsetCities = (adset.cities || []).filter(c => c.key).map(c => ({
            key: c.key,
            radius: c.radius || 15,
            distance_unit: 'mile'
          }));
          const metaTargeting = {
            age_min: 25,
            age_max: 65,
            genders: [2],
            locales: [23, 7], // 23 = Spanish (Latin America), 7 = Spanish (Spain)
            geo_locations: adsetCities.length > 0
              ? { cities: adsetCities }
              : { countries: ['MX'] }, // Fallback for retargeting
            flexible_spec: [{
              interests: [
                { id: '6002884511422', name: 'Small business' },
                { id: '6002998047244', name: 'Blouse' },
                { id: '6003346592981', name: 'Online shopping' },
                { id: '6003371567474', name: 'Entrepreneurship' },
                { id: '6003456388203', name: 'Clothing' },
                { id: '6011366104268', name: "Women's clothing" }
              ],
              behaviors: [
                { id: '6071631541183', name: 'Engaged Shoppers' }
              ]
            }]
          };

          console.log(`    Creating ad set: ${adset.name}`);
          const adsetBudgetCents = Math.round((adset.daily_budget || 25) * 100).toString();
          const adsetParams = {
            account_id: AD_ACCOUNT_ID,
            campaign_id: campaignId,
            name: adset.name,
            optimization_goal: 'CONVERSATIONS',
            billing_event: 'IMPRESSIONS',
            bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
            daily_budget: adsetBudgetCents,
            destination_type: 'WHATSAPP',
            promoted_object: {
              page_id: pageId,
              whats_app_business_phone_number_id: '801380323055565',
              whatsapp_phone_number: '5215657534707'
            },
            status: 'PAUSED',
            targeting: metaTargeting
          };
          const asResult = extractText(await mcpCall('create_adset', adsetParams));
          const adsetId = asResult?.id;
          if (!adsetId) { adsetResults.push({ name: adset.name, error: 'Failed: ' + JSON.stringify(asResult).slice(0, 200) }); continue; }
          console.log(`      Ad set created: ${adsetId}`);

          run(`INSERT INTO adsets (meta_id, campaign_meta_id, name, status, optimization_goal, daily_budget, updated_at)
            VALUES (?, ?, ?, 'PAUSED', ?, ?, datetime('now'))
            ON CONFLICT(meta_id) DO UPDATE SET name=excluded.name`,
            [adsetId, campaignId, adset.name, adset.optimization_goal, adset.daily_budget]);

          // 3. Create ads from assets array (v2.0 format)
          const whatsappSetting = get("SELECT value FROM settings WHERE key = 'whatsapp_link'");
          const adLink = whatsappSetting?.value || 'https://wa.me/5215657534707';
          const adResults = [];
          const uploadedHashes = {}; // url → hash cache

          // Helper: upload one image to Meta
          async function uploadImage(url) {
            if (uploadedHashes[url]) return uploadedHashes[url];
            let hash = null;
            if (url.startsWith('http')) {
              try {
                const r = extractText(await mcpCall('upload_ad_image', { account_id: AD_ACCOUNT_ID, image_url: url }));
                hash = r?.hash || r?.image_hash;
              } catch (e) { console.log(`        Remote upload failed: ${e.message}`); }
            } else if (url.startsWith('/uploads/')) {
              try {
                const localPath = join(UPLOADS_DIR, url.replace('/uploads/', ''));
                if (existsSync(localPath)) {
                  const fileData = readFileSync(localPath);
                  const ext = url.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1] || 'png';
                  const dataUrl = `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${fileData.toString('base64')}`;
                  console.log(`        Uploading: ${url.split('/').pop()} (${(fileData.length/1024).toFixed(0)}KB)`);
                  const r = extractText(await mcpCall('upload_ad_image', { account_id: AD_ACCOUNT_ID, file: dataUrl }));
                  hash = r?.hash || r?.image_hash;
                }
              } catch (e) { console.log(`        Local upload failed: ${e.message}`); }
            }
            if (hash) { uploadedHashes[url] = hash; console.log(`        Hash: ${hash}`); }
            return hash;
          }

          for (const ad of (adset.ads || [])) {
            try {
              console.log(`      Creating ad: ${ad.name} [${ad.format || 'single'}]`);

              // ═══ USE EXISTING POST ═══
              if (ad.object_story_id) {
                console.log(`        Using existing post: ${ad.object_story_id}`);
                let creativeId = null;
                try {
                  const cr = extractText(await mcpCall('create_ad_creative', {
                    account_id: AD_ACCOUNT_ID,
                    name: ad.name + '_existing_post',
                    object_story_id: ad.object_story_id
                  }));
                  creativeId = cr?.id || cr?.creative_id;
                  if (creativeId) console.log(`        Creative from post: ${creativeId}`);
                } catch (e) { console.log(`        Post creative failed: ${e.message}`); }

                if (creativeId) {
                  const adResult = extractText(await mcpCall('create_ad', {
                    account_id: AD_ACCOUNT_ID, adset_id: adsetId,
                    name: ad.name, status: 'PAUSED', creative_id: creativeId
                  }));
                  const adId = adResult?.id;
                  if (adId) {
                    adResults.push({ name: ad.name, id: adId, creative_id: creativeId, source: 'existing_post' });
                    console.log(`        Ad created from post: ${adId}`);
                  } else {
                    adResults.push({ name: ad.name, error: JSON.stringify(adResult).slice(0, 150) });
                  }
                } else {
                  adResults.push({ name: ad.name, error: 'Failed to create creative from post' });
                }
                continue;
              }

              // ═══ HARD POLICY GUARD — Sahiba runs IG-first ═══
              // Every ad MUST reference an existing Instagram post (object_story_id).
              // Raw image/video upload is REFUSED to enforce the Instagram-first workflow.
              // See memory: project_instagram_first_workflow.md.
              adResults.push({ name: ad.name, error: 'POLICY: Sahiba ads must reference an existing Instagram post (object_story_id). Raw image/video ads are not allowed. Use the Promote IG tab.' });
              console.log(`        REFUSED: no object_story_id — Sahiba policy requires existing IG post`);
              continue;
              /* eslint-disable */
              const adAssets = ad.assets || [];
              const imageAssets = adAssets.filter(a => a.type === 'image' || a.type === 'ig_post');
              const fallbackUrl = ad.creative?.image_url;

              // Upload all images for this ad
              const hashes = [];
              if (imageAssets.length > 0) {
                for (const asset of imageAssets) {
                  if (asset.url) {
                    const hash = await uploadImage(asset.url);
                    if (hash) hashes.push(hash);
                  }
                }
              } else if (fallbackUrl) {
                const hash = await uploadImage(fallbackUrl);
                if (hash) hashes.push(hash);
              }

              if (hashes.length === 0) {
                adResults.push({ name: ad.name, error: 'No images uploaded' });
                continue;
              }

              // Create creative — carousel if multiple hashes, single if one
              let creativeId = null;
              const primaryText = ad.creative?.message || 'Catálogo GRATIS por WhatsApp';

              // Create ONE ad per image (Engagement+WhatsApp doesn't support carousel)
              // Meta rotates ads automatically within the ad set
              for (let hi = 0; hi < hashes.length; hi++) {
                const adName = hashes.length > 1 ? `${ad.name}_${hi + 1}` : ad.name;
                const copyIdx = hi % (ad.creative ? 3 : 1);
                const texts = [
                  ad.creative?.message || primaryText,
                  ad.creative?.hook || primaryText,
                  primaryText
                ];

                let creativeId = null;
                try {
                  const cr = extractText(await mcpCall('create_ad_creative', {
                    account_id: AD_ACCOUNT_ID,
                    name: adName + '_creative',
                    page_id: pageId,
                    image_hash: hashes[hi],
                    message: texts[copyIdx],
                    link_url: adLink,
                    call_to_action_type: 'WHATSAPP_MESSAGE'
                  }));
                  creativeId = cr?.id || cr?.creative_id;
                  if (creativeId) console.log(`        Creative: ${creativeId}`);
                } catch (e) { console.log(`        Creative failed: ${e.message}`); }

                if (!creativeId) { adResults.push({ name: adName, error: 'Creative failed' }); continue; }

                const adResult = extractText(await mcpCall('create_ad', {
                  account_id: AD_ACCOUNT_ID,
                  adset_id: adsetId,
                  name: adName,
                  status: 'PAUSED',
                  creative_id: creativeId
                }));
                const adId = adResult?.id;
                if (adId) {
                  adResults.push({ name: adName, id: adId, creative_id: creativeId });
                  console.log(`        Ad created: ${adId}`);
                } else {
                  adResults.push({ name: adName, error: JSON.stringify(adResult).slice(0, 150) });
                }
              } // end for hashes loop
            } catch (e) { adResults.push({ name: ad.name, error: e.message }); }
          } // end for ads loop

          adsetResults.push({ name: adset.name, id: adsetId, ads: adResults });
        } catch (e) { adsetResults.push({ name: adset.name, error: e.message }); }
      }

      results.push({ name: camp.name, id: campaignId, adsets: adsetResults });
    } catch (e) { results.push({ name: camp.name, error: e.message }); }
  }

  res.json({ results });
});

// --- AI Copy Generation ---
app.post('/api/generate-copy', (req, res) => {
  const { type, product, city, price } = req.body;
  const copy = generateCopy(type || 'TESTING', product || 'Vestido', city || '', price || '130');
  res.json(copy);
});

// --- Budget Allocation Info ---
app.get('/api/budget-allocation', (req, res) => {
  res.json(BUDGET_MAP);
});

// --- Daily AI Report ---
app.get('/api/daily-report', (req, res) => {
  const report = generateDailyReport();
  // Save to ai_recommendations
  run(`INSERT INTO ai_recommendations (date, type, title, body, priority)
    VALUES (?, 'daily_report', 'Daily AI Report', ?, 'high')`,
    [report.date, JSON.stringify(report)]);
  res.json(report);
});

// --- Recalculate AI labels for all campaigns ---
app.post('/api/recalculate-labels', (req, res) => {
  const allCamps = all('SELECT * FROM campaigns');
  for (const camp of allCamps) {
    const insights = get(`SELECT SUM(spend) as spend, SUM(clicks) as clicks, SUM(link_clicks) as link_clicks,
      AVG(ctr) as ctr, AVG(frequency) as frequency
      FROM insights_daily WHERE campaign_meta_id = ?`, [camp.meta_id]);
    const label = computeAiLabelV2(camp, insights);
    run('UPDATE campaigns SET ai_label = ? WHERE meta_id = ?', [label, camp.meta_id]);
  }
  // Regenerate alerts
  run("DELETE FROM alerts WHERE resolved = 0");
  const insightsMap = {};
  const updatedCamps = all('SELECT * FROM campaigns');
  for (const camp of updatedCamps) {
    insightsMap[camp.meta_id] = get(`SELECT SUM(spend) as spend, SUM(clicks) as clicks, AVG(ctr) as ctr, AVG(frequency) as frequency
      FROM insights_daily WHERE campaign_meta_id = ?`, [camp.meta_id]);
  }
  const newAlerts = generateAlerts(updatedCamps, insightsMap);
  for (const a of newAlerts) {
    run('INSERT INTO alerts (type, severity, message, campaign_meta_id) VALUES (?, ?, ?, ?)',
      [a.type, a.severity, a.message, a.campaign_meta_id]);
  }
  res.json({ ok: true, campaigns: updatedCamps.length, alerts: newAlerts.length });
});

// ═══ START ═══
async function start() {
  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Run schema using exec (handles multiple statements)
  const schema = readFileSync(join(__dirname, 'db', 'schema.sql'), 'utf-8');
  db.exec(schema);
  saveDb();

  app.listen(PORT, async () => {
    console.log(`
+==========================================+
|   Sahiba CRM Server                      |
+==========================================+
|   API:   http://localhost:${PORT}            |
|   Stop:  Ctrl+C                          |
+==========================================+
    `);

    try { await syncFromPipeboard(); }
    catch (e) {
      console.error('  Initial sync failed:', e.message);
      console.log('  Server running — sync manually via POST /api/sync');
    }
  });
}

start();
