-- =====================================================================
-- Sahiba CRM — Neon Postgres Schema
-- =====================================================================
-- Translated from db/schema.sql (SQLite) for the cloud migration.
--
-- This file is documentation. The canonical executable version lives in
-- netlify/functions/db-init.js (an array of statements run by /api/db-init).
--
-- Key translations from SQLite:
--   INTEGER PRIMARY KEY AUTOINCREMENT  ->  SERIAL PRIMARY KEY
--   REAL                               ->  DOUBLE PRECISION
--   TEXT DEFAULT (datetime('now'))     ->  TIMESTAMP DEFAULT NOW()
--   INTEGER (used as boolean)          ->  INTEGER (kept, to minimize app
--                                          code changes; can convert to
--                                          BOOLEAN in a later cleanup)
--   TEXT storing JSON ('[]', '{}')     ->  TEXT (kept; can convert to
--                                          JSONB in a later cleanup)
--   CHECK(col IN (...))                ->  same syntax, works in Postgres
--   CREATE INDEX IF NOT EXISTS         ->  same syntax, works in Postgres
--
-- Coexists in the same Neon database with the Respond Tracker tables
-- (nancy_contacts, jazmin_contacts, nancy_historial, jazmin_historial).
-- No name collisions.
-- =====================================================================

-- ---------- Meta Ads structural tables ----------

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  meta_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  objective TEXT,
  status TEXT DEFAULT 'PAUSED',
  category TEXT CHECK(category IN ('BEACHFRONT','WHOLESALE','TESTING','RETARGET','UNCATEGORIZED')) DEFAULT 'UNCATEGORIZED',
  buying_type TEXT,
  daily_budget DOUBLE PRECISION,
  lifetime_budget DOUBLE PRECISION,
  start_time TEXT,
  ai_label TEXT CHECK(ai_label IN ('SCALE','MONITOR','FIX','PAUSE')) DEFAULT 'MONITOR',
  special_ad_categories TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS adsets (
  id SERIAL PRIMARY KEY,
  meta_id TEXT UNIQUE NOT NULL,
  campaign_id INTEGER REFERENCES campaigns(id),
  campaign_meta_id TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'PAUSED',
  optimization_goal TEXT,
  billing_event TEXT,
  daily_budget DOUBLE PRECISION,
  lifetime_budget DOUBLE PRECISION,
  targeting_json TEXT DEFAULT '{}',
  start_time TEXT,
  end_time TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads (
  id SERIAL PRIMARY KEY,
  meta_id TEXT UNIQUE NOT NULL,
  adset_id INTEGER REFERENCES adsets(id),
  adset_meta_id TEXT,
  campaign_meta_id TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'PAUSED',
  creative_meta_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creatives (
  id SERIAL PRIMARY KEY,
  meta_id TEXT UNIQUE,
  ad_meta_id TEXT,
  name TEXT,
  image_url TEXT,
  video_url TEXT,
  message TEXT,
  headline TEXT,
  cta TEXT,
  link TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insights_daily (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  campaign_meta_id TEXT,
  campaign_name TEXT,
  adset_meta_id TEXT,
  adset_name TEXT,
  ad_meta_id TEXT,
  ad_name TEXT,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  link_clicks INTEGER DEFAULT 0,
  spend DOUBLE PRECISION DEFAULT 0,
  cpc DOUBLE PRECISION DEFAULT 0,
  cpm DOUBLE PRECISION DEFAULT 0,
  ctr DOUBLE PRECISION DEFAULT 0,
  reach INTEGER DEFAULT 0,
  frequency DOUBLE PRECISION DEFAULT 0,
  unique_clicks INTEGER DEFAULT 0,
  actions_json TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, ad_meta_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ---------- Media library ----------

CREATE TABLE IF NOT EXISTS media_assets (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT CHECK(type IN ('image','video','ig_post')) DEFAULT 'image',
  source TEXT CHECK(source IN ('upload','url','gdrive')) DEFAULT 'url',
  gdrive_file_id TEXT,
  gdrive_folder_id TEXT,
  thumbnail_url TEXT,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  product TEXT,
  category TEXT,
  tags TEXT DEFAULT '[]',
  group_name TEXT,
  used_in_campaigns TEXT DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gdrive_sync (
  id SERIAL PRIMARY KEY,
  folder_id TEXT NOT NULL,
  folder_name TEXT,
  last_synced_at TIMESTAMP,
  auto_sync INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ---------- CRM (sales pipeline) ----------

CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  phone TEXT,
  name TEXT,
  campaign_meta_id TEXT,
  adset_meta_id TEXT,
  ad_meta_id TEXT,
  source TEXT,
  stage TEXT CHECK(stage IN ('cold','warm','hot','customer','lost')) DEFAULT 'cold',
  score INTEGER DEFAULT 0,
  agent_id INTEGER REFERENCES agents(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  campaign_meta_id TEXT,
  agent_id INTEGER REFERENCES agents(id),
  started_at TIMESTAMP,
  last_message_at TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  first_response_time INTEGER,
  catalog_sent INTEGER DEFAULT 0,
  replied_after_catalog INTEGER DEFAULT 0,
  payment_discussed INTEGER DEFAULT 0,
  marked_sale INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS funnel_events (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  campaign_meta_id TEXT,
  event_type TEXT CHECK(event_type IN ('click','whatsapp_open','conversation_start','catalog_sent','qualified','hot','payment','sale')) NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  conversation_id INTEGER REFERENCES conversations(id),
  campaign_meta_id TEXT,
  agent_id INTEGER REFERENCES agents(id),
  amount DOUBLE PRECISION,
  product TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT CHECK(severity IN ('info','warning','critical')) DEFAULT 'warning',
  message TEXT NOT NULL,
  campaign_meta_id TEXT,
  resolved INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id SERIAL PRIMARY KEY,
  date TEXT,
  type TEXT,
  title TEXT NOT NULL,
  body TEXT,
  priority TEXT CHECK(priority IN ('low','medium','high')) DEFAULT 'medium',
  status TEXT CHECK(status IN ('pending','accepted','dismissed')) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ---------- Indexes ----------

CREATE INDEX IF NOT EXISTS idx_media_product ON media_assets(product);
CREATE INDEX IF NOT EXISTS idx_media_group ON media_assets(group_name);
CREATE INDEX IF NOT EXISTS idx_media_type ON media_assets(type);
CREATE INDEX IF NOT EXISTS idx_insights_date ON insights_daily(date);
CREATE INDEX IF NOT EXISTS idx_insights_campaign ON insights_daily(campaign_meta_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_meta_id);
CREATE INDEX IF NOT EXISTS idx_funnel_campaign ON funnel_events(campaign_meta_id);
CREATE INDEX IF NOT EXISTS idx_funnel_type ON funnel_events(event_type);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved);
