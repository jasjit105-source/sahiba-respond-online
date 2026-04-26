// =====================================================================
// db/migrate-to-neon.js — one-shot SQLite -> Neon Postgres migration
// =====================================================================
// Reads db/sahiba.db (sql.js) and copies every row in every Sahiba CRM
// table into the matching Neon table. Preserves original `id` values so
// foreign-key references stay valid, then resets each table's SERIAL
// sequence to MAX(id)+1 so future inserts work.
//
// Usage:
//   node db/migrate-to-neon.js          # safe mode: aborts if Neon tables have rows
//   node db/migrate-to-neon.js --force  # truncate Neon tables first, then migrate
//
// Reads DATABASE_URL from .env (gitignored). Does NOT touch the
// Respond Tracker tables (nancy_*, jazmin_*, yoana_*).
// =====================================================================

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQLITE_PATH = path.join(__dirname, 'sahiba.db');
const FORCE = process.argv.includes('--force');

// Migration order matters for FK references: parents before children.
const TABLES_IN_ORDER = [
  // No FK dependencies
  'settings',
  'agents',
  'campaigns',
  'creatives',
  'insights_daily',
  'media_assets',
  'gdrive_sync',
  'ai_recommendations',
  'alerts',
  // Children of campaigns
  'adsets',
  // Children of adsets
  'ads',
  // Children of agents
  'leads',
  // Children of leads + agents
  'conversations',
  'funnel_events',
  // Children of leads + conversations + agents
  'sales',
];

// ---------- helpers ----------
function log(msg)   { process.stdout.write(msg + '\n'); }
function err(msg)   { process.stderr.write('  ✗ ' + msg + '\n'); }
function ok(msg)    { process.stdout.write('  ✓ ' + msg + '\n'); }
function info(msg)  { process.stdout.write('    ' + msg + '\n'); }
function fail(msg)  { err(msg); process.exit(1); }

async function main() {
  log('=========================================================');
  log('Sahiba CRM — SQLite -> Neon migration');
  log('=========================================================');

  // ----- Validate environment -----
  if (!process.env.DATABASE_URL) {
    fail('DATABASE_URL not set. Did you create .env from .env.example?');
  }
  if (!fs.existsSync(SQLITE_PATH)) {
    fail(`SQLite file not found at ${SQLITE_PATH}`);
  }
  const dbStat = fs.statSync(SQLITE_PATH);
  log(`SQLite source : ${SQLITE_PATH} (${(dbStat.size / 1024).toFixed(1)} KB)`);
  log(`Neon target   : ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
  log(`Mode          : ${FORCE ? 'FORCE (truncate first)' : 'safe (abort if non-empty)'}`);
  log('');

  // ----- Open SQLite -----
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(SQLITE_PATH);
  const sqlite = new SQL.Database(new Uint8Array(buf));

  // ----- Connect to Neon -----
  const sql = neon(process.env.DATABASE_URL);

  // ----- Sanity ping -----
  try {
    const r = await sql('SELECT NOW() as now, current_database() as db');
    info(`Neon reachable. db=${r[0].db}, now=${r[0].now}`);
  } catch (e) {
    fail(`Cannot connect to Neon: ${e.message}`);
  }

  // ----- Pre-check: are target tables empty? -----
  log('');
  log('Step 1 — checking target tables...');
  const targetCounts = {};
  for (const t of TABLES_IN_ORDER) {
    try {
      const r = await sql(`SELECT COUNT(*)::int as c FROM ${t}`);
      targetCounts[t] = r[0].c;
    } catch (e) {
      fail(`Target table "${t}" missing or unreadable: ${e.message}\n` +
           `Did you run /api/db-init first?`);
    }
  }
  const nonEmpty = Object.entries(targetCounts).filter(([, c]) => c > 0);
  if (nonEmpty.length && !FORCE) {
    err('Target tables already have data:');
    nonEmpty.forEach(([t, c]) => err(`    ${t}: ${c} rows`));
    err('');
    err('Re-run with --force to truncate and re-migrate.');
    process.exit(1);
  }
  if (FORCE && nonEmpty.length) {
    log('  Truncating non-empty Sahiba CRM tables (CASCADE)...');
    // Truncate in reverse FK order so dependents go first.
    // Single TRUNCATE with multiple tables is atomic; CASCADE handles any
    // residual references safely (only Sahiba CRM tables FK each other —
    // tracker tables don't FK these so they're untouched).
    const list = [...TABLES_IN_ORDER].reverse().map(t => `"${t}"`).join(', ');
    await sql(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    ok('Truncated.');
  } else {
    ok('All 15 Sahiba CRM tables are empty. Proceeding.');
  }

  // ----- Migrate each table -----
  log('');
  log('Step 2 — migrating data...');
  const summary = [];

  for (const table of TABLES_IN_ORDER) {
    let result;
    try {
      result = sqlite.exec(`SELECT * FROM ${table}`);
    } catch (e) {
      err(`${table}: SQLite read failed (${e.message}) — skipping`);
      summary.push({ table, sqlite: 0, neon: 0, status: 'sqlite-error' });
      continue;
    }

    if (!result.length || !result[0].values.length) {
      info(`${table}: 0 rows in SQLite (skipped)`);
      summary.push({ table, sqlite: 0, neon: 0, status: 'empty-source' });
      continue;
    }

    const { columns, values } = result[0];
    const colList = columns.map(c => `"${c}"`).join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;

    let inserted = 0;
    let failed = 0;
    for (const row of values) {
      try {
        await sql(insertSql, row);
        inserted++;
      } catch (e) {
        failed++;
        if (failed <= 3) {
          err(`${table}: row insert failed (${e.message})`);
          err(`  row data: ${JSON.stringify(row).slice(0, 200)}`);
        } else if (failed === 4) {
          err(`${table}: ...further row errors suppressed...`);
        }
      }
    }

    // Reset SERIAL sequence so next insert gets MAX(id)+1.
    // Skip for tables without an `id` column (settings uses `key` as PK).
    if (columns.includes('id')) {
      try {
        await sql(
          `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
                         COALESCE((SELECT MAX(id) FROM "${table}"), 1))`
        );
      } catch (e) {
        err(`${table}: sequence reset failed (${e.message})`);
      }
    }

    if (failed === 0) {
      ok(`${table}: ${inserted} rows migrated`);
    } else {
      err(`${table}: ${inserted} rows migrated, ${failed} failed`);
    }
    summary.push({ table, sqlite: values.length, neon: inserted, failed, status: failed ? 'partial' : 'ok' });
  }

  // ----- Final verification -----
  log('');
  log('Step 3 — verifying row counts...');
  const finalCounts = {};
  for (const t of TABLES_IN_ORDER) {
    const r = await sql(`SELECT COUNT(*)::int as c FROM ${t}`);
    finalCounts[t] = r[0].c;
  }

  log('');
  log('=========================================================');
  log('Summary:');
  log('=========================================================');
  log('  Table                      SQLite     Neon  Status');
  log('  -------------------------  ------  -------  ------');
  let totalSqlite = 0, totalNeon = 0;
  for (const row of summary) {
    const t = row.table.padEnd(25);
    const s = String(row.sqlite).padStart(6);
    const n = String(finalCounts[row.table]).padStart(7);
    log(`  ${t}  ${s}  ${n}  ${row.status}`);
    totalSqlite += row.sqlite;
    totalNeon += finalCounts[row.table];
  }
  log('  -------------------------  ------  -------  ------');
  log(`  TOTAL                       ${String(totalSqlite).padStart(5)}    ${String(totalNeon).padStart(5)}`);
  log('');

  const anyFailed = summary.some(s => s.status === 'partial' || s.status === 'sqlite-error');
  if (anyFailed) {
    log('⚠ Some rows did not migrate cleanly. Review the errors above.');
    process.exit(2);
  } else {
    log('✓ Migration complete.');
  }
}

main().catch((e) => {
  err('Fatal: ' + (e.stack || e.message || e));
  process.exit(1);
});
