import express from 'express';
import cors from 'cors';
import multer from 'multer';
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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
let requestId = 0;

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

  // 4. Insights (all available — Pipeboard returns lifetime data)
  try {
    const insResult = extractText(await mcpCall('get_insights', { account_id: AD_ACCOUNT_ID }));
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
    // Parallel: campaigns, daily account totals, ads
    const [campRaw, dailyRaw, adsRaw] = await Promise.all([
      mcpCall('get_insights', { object_id: AD_ACCOUNT_ID, level: 'campaign', time_range: timeRange }),
      mcpCall('get_insights', { object_id: AD_ACCOUNT_ID, level: 'account', time_range: timeRange, time_breakdown: 'day' }),
      mcpCall('get_insights', { object_id: AD_ACCOUNT_ID, level: 'ad', time_range: timeRange })
    ]);

    const campData = extractText(campRaw);
    const dailyData = extractText(dailyRaw);
    const adsData = extractText(adsRaw);

    const campList = campData?.data || (Array.isArray(campData) ? campData : []);
    const adsList = adsData?.data || (Array.isArray(adsData) ? adsData : []);

    // Parse campaigns
    const camps = campList.map(c => {
      const ac = c.actions || [];
      return {
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
        id: a.ad_id,
        name: a.ad_name,
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

    // DOW
    const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dow = {};
    DOW.forEach(d => { dow[d] = { spend: 0, clicks: 0, impressions: 0, msgs: 0, count: 0 }; });
    days.forEach(d => {
      if (!d.spend && !d.clicks) return;
      const dn = DOW[new Date(d.date + 'T12:00:00').getDay()];
      dow[dn].spend += d.spend;
      dow[dn].clicks += d.clicks;
      dow[dn].impressions += d.impressions;
      dow[dn].msgs += d.msgs;
      dow[dn].count++;
    });
    const dowS = DOW.map(n => {
      const d = dow[n];
      if (!d.count) return null;
      return {
        day: n,
        avgSpend: d.spend / d.count,
        avgMsgs: d.msgs / d.count,
        cpr: d.msgs > 0 ? d.spend / d.msgs : null
      };
    }).filter(Boolean).sort((a, b) => (a.cpr || 999) - (b.cpr || 999));

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

    const fetchTime = ((Date.now() - t0) / 1000).toFixed(1);

    res.json({
      period: { sd: dateFrom, ed: dateTo },
      camps, ads, days, dowS, funnel, weekly,
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

              // ═══ CREATE NEW AD FROM ASSETS ═══
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
