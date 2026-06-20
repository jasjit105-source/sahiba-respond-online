import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

// ═══ HELPERS ═══
const fmt = (n, d = 0) => n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const $ = (n, d = 2) => n != null ? '$' + fmt(n, d) : '—';
const pct = (n, d = 2) => n != null ? fmt(n, d) + '%' : '—';
const DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function gp(p) {
  const t = new Date();
  const e = t.toISOString().split('T')[0];
  let s;
  switch (p) {
    case '7d': s = new Date(t - 7 * 864e5); break;
    case '14d': s = new Date(t - 14 * 864e5); break;
    case '30d': s = new Date(t - 30 * 864e5); break;
    case '90d': s = new Date(t - 90 * 864e5); break;
    case '120d': s = new Date(t - 120 * 864e5); break;
    case 'this_month': s = new Date(t.getFullYear(), t.getMonth(), 1); break;
    case 'last_month': {
      const l = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      const le = new Date(t.getFullYear(), t.getMonth(), 0);
      return { since: l.toISOString().split('T')[0], until: le.toISOString().split('T')[0] };
    }
    default: s = new Date(t - 30 * 864e5);
  }
  return { since: s.toISOString().split('T')[0], until: e };
}

// ═══ STYLES ═══
const STYLES = `
body { background: #111318 !important; }
main { max-width: none !important; padding: 0 !important; }
.analyzer {
  --abg: #111318; --as1: #1a1d25; --as2: #22262f; --abdr: #363d4d;
  --at: #f0f2f5; --at2: #a8b2c1; --at3: #7a8599;
  --gold: #f0c050; --gold2: #f5d070;
  --grn: #4ade80; --grn-d: rgba(74,222,128,.15);
  --red: #f87171; --red-d: rgba(248,113,113,.15);
  --blu: #60a5fa; --blu-d: rgba(96,165,250,.15);
  --pur: #a78bfa; --pur-d: rgba(167,139,250,.15);
  --org: #fb923c; --org-d: rgba(251,146,60,.15);
  font-family: 'DM Sans', sans-serif;
  background: #111318;
  color: #f0f2f5;
  padding: 1.5rem 2rem;
  min-height: 100vh;
}
.analyzer h1 { font-family: 'Libre Baskerville', serif; font-size: 1.8rem; color: var(--gold); }
.analyzer .sub { color: var(--at2); font-size: .8rem; margin-top: .2rem; }
.analyzer .ctl { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin: 1.5rem 0; background: var(--as1); border: 1px solid var(--abdr); border-radius: 12px; padding: 1rem 1.25rem; }
.analyzer .ctl label { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em; color: var(--at2); }
.analyzer .ctl input[type=date] { background: var(--as2); border: 1px solid var(--abdr); color: var(--at); padding: .45rem .6rem; border-radius: 6px; font-family: 'DM Sans'; font-size: .82rem; }
.analyzer .ctl input[type=date]::-webkit-calendar-picker-indicator { filter: invert(.7); }
.analyzer .pbtn { display: flex; gap: .35rem; flex-wrap: wrap; }
.analyzer .pb { background: var(--as2); border: 1px solid var(--abdr); color: var(--at2); padding: .35rem .65rem; border-radius: 6px; font-size: .72rem; cursor: pointer; font-family: 'DM Sans'; transition: all .15s; }
.analyzer .pb:hover, .analyzer .pb.a { background: var(--gold); color: var(--abg); border-color: var(--gold); font-weight: 600; }
.analyzer .go { background: var(--gold); color: var(--abg); border: none; padding: .5rem 1.4rem; border-radius: 8px; font-weight: 700; font-size: .85rem; cursor: pointer; font-family: 'DM Sans'; }
.analyzer .go:hover { background: var(--gold2); }
.analyzer .go:disabled { opacity: .5; cursor: not-allowed; }
.analyzer .ld { text-align: center; padding: 4rem 0; color: var(--at2); }
.analyzer .ld .sp { width: 36px; height: 36px; border: 3px solid var(--abdr); border-top-color: var(--gold); border-radius: 50%; animation: an-spin .8s linear infinite; margin: 0 auto 1rem; }
@keyframes an-spin { to { transform: rotate(360deg); } }
.analyzer .err { background: var(--red-d); border: 1px solid rgba(248,113,113,.3); border-radius: 10px; padding: 1rem; color: var(--red); font-size: .85rem; margin: 1rem 0; }
.analyzer .kr { display: grid; grid-template-columns: repeat(auto-fit, minmax(155px, 1fr)); gap: .75rem; margin-bottom: 2rem; }
.analyzer .k { background: var(--as1); border: 1px solid var(--abdr); border-radius: 10px; padding: 1rem; position: relative; overflow: hidden; }
.analyzer .k::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 10px 10px 0 0; }
.analyzer .k:nth-child(1)::before { background: var(--gold); }
.analyzer .k:nth-child(2)::before { background: var(--pur); }
.analyzer .k:nth-child(3)::before { background: var(--grn); }
.analyzer .k:nth-child(4)::before { background: var(--blu); }
.analyzer .k:nth-child(5)::before { background: var(--org); }
.analyzer .k:nth-child(6)::before { background: var(--red); }
.analyzer .k .l { font-size: .7rem; text-transform: uppercase; letter-spacing: .07em; color: var(--at2); margin-bottom: .35rem; }
.analyzer .k .v { font-size: 1.5rem; font-weight: 700; }
.analyzer .k .s { font-size: .72rem; color: var(--at3); margin-top: .15rem; }
.analyzer .sec { margin-bottom: 2rem; }
.analyzer .sh { font-family: 'Libre Baskerville', serif; font-size: 1.2rem; color: var(--gold); margin-bottom: .85rem; display: flex; align-items: center; gap: .5rem; }
.analyzer .sh::before { content: ''; width: 3px; height: 18px; background: var(--gold); border-radius: 2px; flex-shrink: 0; }
.analyzer .tw { overflow-x: auto; border-radius: 10px; border: 1px solid var(--abdr); }
.analyzer table { width: 100%; border-collapse: collapse; font-size: .84rem; }
.analyzer thead th { background: var(--as2); padding: .6rem .7rem; text-align: left; font-weight: 600; color: var(--at2); text-transform: uppercase; font-size: .68rem; letter-spacing: .05em; border-bottom: 1px solid var(--abdr); white-space: nowrap; }
.analyzer thead th.r { text-align: right; }
.analyzer tbody td { padding: .6rem .7rem; border-bottom: 1px solid rgba(255,255,255,.06); white-space: nowrap; }
.analyzer tbody td.r { text-align: right; font-variant-numeric: tabular-nums; }
.analyzer tbody tr:hover { background: rgba(232,176,74,.06); }
.analyzer .best { color: var(--grn); font-weight: 600; }
.analyzer .worst { color: var(--red); font-weight: 600; }
.analyzer .tag { display: inline-block; font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: .2rem .55rem; border-radius: 4px; }
.analyzer .tag.inc { background: var(--grn-d); color: var(--grn); }
.analyzer .tag.dec { background: var(--red-d); color: var(--red); }
.analyzer .tag.test { background: var(--blu-d); color: var(--blu); }
.analyzer .tag.mon { background: var(--pur-d); color: var(--pur); }
.analyzer .tag.pau { background: var(--org-d); color: var(--org); }
.analyzer .vds { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: .75rem; margin-bottom: 2rem; }
.analyzer .vd { background: var(--as1); border: 1px solid var(--abdr); border-radius: 10px; padding: 1rem; }
.analyzer .vd h3 { font-size: .95rem; font-weight: 600; margin: .4rem 0 .3rem; }
.analyzer .vd p { font-size: .84rem; color: var(--at2); line-height: 1.55; }
.analyzer .vd .ms { display: flex; gap: .5rem; margin-top: .5rem; flex-wrap: wrap; }
.analyzer .vd .ms span { font-size: .74rem; color: var(--at3); background: var(--as2); padding: .2rem .5rem; border-radius: 4px; }
.analyzer .vd .ms span b { color: var(--at); font-weight: 600; }
.analyzer .bt { height: 16px; background: rgba(255,255,255,.04); border-radius: 3px; overflow: hidden; max-width: 100px; display: inline-block; vertical-align: middle; }
.analyzer .bf { height: 100%; border-radius: 3px; }
.analyzer .bf.g { background: var(--grn); }
.analyzer .bf.r { background: var(--red); }
.analyzer .bf.b { background: var(--blu); }
.analyzer .bf.o { background: var(--gold); }
.analyzer .fn { display: flex; flex-direction: column; gap: .35rem; }
.analyzer .fs { display: flex; align-items: center; gap: .6rem; }
.analyzer .fb { height: 28px; border-radius: 4px; display: flex; align-items: center; padding: 0 .6rem; font-size: .78rem; font-weight: 600; color: var(--abg); }
.analyzer .fl { font-size: .78rem; color: var(--at2); min-width: 100px; }
.analyzer .tc { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 800px) { .analyzer .tc { grid-template-columns: 1fr; } }
.analyzer .cd { background: var(--as1); border: 1px solid var(--abdr); border-radius: 10px; padding: 1.1rem; }
.analyzer .cd h4 { font-size: .78rem; text-transform: uppercase; letter-spacing: .05em; color: var(--at2); margin-bottom: .6rem; }
.analyzer .es { text-align: center; padding: 5rem 2rem; color: var(--at2); }
.analyzer .es h2 { font-family: 'Libre Baskerville', serif; color: var(--gold); font-size: 1.3rem; margin-bottom: .5rem; }
.analyzer .es p { font-size: .85rem; max-width: 400px; margin: 0 auto; }
.analyzer .ts { font-size: .68rem; color: var(--at3); text-align: right; margin-top: 1rem; }
.analyzer .tabs { display: flex; gap: 0; margin-bottom: 1rem; border-bottom: 1px solid var(--abdr); flex-wrap: wrap; }
.analyzer .tab { padding: .65rem 1.3rem; font-size: .85rem; font-weight: 500; color: var(--at2); cursor: pointer; border-bottom: 2px solid transparent; transition: all .15s; background: none; border-top: none; border-left: none; border-right: none; font-family: 'DM Sans'; }
.analyzer .tab:hover { color: var(--at); }
.analyzer .tab.active { color: var(--gold); border-bottom-color: var(--gold); }
.analyzer .day-row { cursor: pointer; transition: background .15s; }
.analyzer .day-row:hover { background: rgba(232,176,74,.06) !important; }
.analyzer .tracker-hdr { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; }
.analyzer .tracker-hdr p { font-size: .84rem; color: var(--at2); line-height: 1.5; flex: 1; min-width: 250px; }
.analyzer .snap-btn { background: var(--gold); color: var(--abg); border: none; padding: .55rem 1.2rem; border-radius: 8px; font-weight: 700; font-size: .82rem; cursor: pointer; font-family: 'DM Sans'; white-space: nowrap; }
.analyzer .snap-btn:hover { background: var(--gold2); }
.analyzer .delta { font-weight: 600; }
.analyzer .delta.up { color: var(--grn); }
.analyzer .delta.dn { color: var(--red); }
.analyzer .delta.flat { color: var(--at3); }
.analyzer .snap-info { background: var(--as1); border: 1px solid var(--abdr); border-radius: 10px; padding: 1rem; margin-bottom: 1.5rem; font-size: .82rem; color: var(--at2); }
.analyzer .snap-info b { color: var(--at); }
.analyzer .compare-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .75rem; margin-bottom: 1.5rem; }
.analyzer .compare-card { background: var(--as1); border: 1px solid var(--abdr); border-radius: 10px; padding: 1rem; text-align: center; }
.analyzer .compare-card .cl { font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; color: var(--at2); margin-bottom: .3rem; }
.analyzer .compare-card .cv { font-size: 1.3rem; font-weight: 700; }
.analyzer .snap-list { margin-top: 1rem; }
.analyzer .snap-item { background: var(--as1); border: 1px solid var(--abdr); border-radius: 8px; padding: .75rem 1rem; margin-bottom: .5rem; display: flex; justify-content: space-between; align-items: center; font-size: .82rem; }
.analyzer .snap-item .snap-date { font-weight: 500; color: var(--at); }
.analyzer .snap-item .snap-meta { color: var(--at2); font-size: .75rem; }
.analyzer .snap-item button { background: none; border: 1px solid var(--abdr); color: var(--at2); padding: .25rem .5rem; border-radius: 4px; font-size: .72rem; cursor: pointer; font-family: 'DM Sans'; }
.analyzer .snap-item button:hover { border-color: var(--gold); color: var(--gold); }
.analyzer .rec { background: var(--as1); border: 1px solid var(--abdr); border-radius: 10px; padding: 1.1rem 1.2rem; margin-bottom: .75rem; border-left: 4px solid var(--abdr); }
.analyzer .rec.scale { border-left-color: var(--grn); }
.analyzer .rec.reactivate { border-left-color: var(--blu); }
.analyzer .rec.optimize { border-left-color: var(--org); }
.analyzer .rec.cut { border-left-color: var(--red); }
.analyzer .rec.dead { border-left-color: var(--at3); }
.analyzer .rec-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.analyzer .rec-name { font-weight: 600; font-size: .95rem; }
.analyzer .rec-camp { font-size: .75rem; color: var(--at2); margin-top: 2px; }
.analyzer .rec-stats { display: flex; gap: .6rem; flex-wrap: wrap; margin: .6rem 0; }
.analyzer .rec-stats span { font-size: .75rem; color: var(--at2); background: var(--as2); padding: .2rem .5rem; border-radius: 4px; }
.analyzer .rec-stats span b { color: var(--at); font-weight: 600; }
.analyzer .rec-why { font-size: .84rem; color: var(--at2); line-height: 1.6; margin: .5rem 0; }
.analyzer .rec-action { font-size: .8rem; font-weight: 500; padding: .45rem .75rem; border-radius: 6px; margin-top: .5rem; display: inline-block; }
.analyzer .rec-action.g { background: var(--grn-d); color: var(--grn); }
.analyzer .rec-action.b { background: var(--blu-d); color: var(--blu); }
.analyzer .rec-action.o { background: var(--org-d); color: var(--org); }
.analyzer .rec-action.r { background: var(--red-d); color: var(--red); }
.analyzer .rec-action.x { background: rgba(122,133,153,.15); color: var(--at3); }
.analyzer .rec-score { font-size: .72rem; color: var(--at3); margin-top: .5rem; }
.analyzer .sec-label { font-size: .78rem; font-weight: 600; color: var(--gold); text-transform: uppercase; letter-spacing: .05em; margin: 1.5rem 0 .6rem; padding-bottom: .4rem; border-bottom: 1px solid var(--abdr); }
.analyzer .day-detail { background: var(--as2); border-bottom: 1px solid var(--abdr); }
.analyzer .day-detail td { padding: .4rem .7rem; font-size: .78rem; color: var(--at2); }
`;

// ═══ OVERVIEW TAB ═══
function OverviewTab({ camps, avgCPR, funnel, weekly, totals, dowRich, ads, nDays }) {
  const maxWS = Math.max(...weekly.map(w => w.spend), 1);

  // Build action center
  const scale = camps.filter(c => c.verdict && (c.verdict.label.includes('SCALE') || c.verdict.label === 'REACTIVATE'));
  const cut = camps.filter(c => c.verdict && (c.verdict.label.includes('CUT') || c.verdict.label === 'PAUSE'));
  const reduce = camps.filter(c => c.verdict && c.verdict.label === 'REDUCE');
  const validDays = dowRich?.rows?.filter(r => !r.noData && r.cpr != null) || [];
  const bestDay = validDays.length ? validDays.slice().sort((a, b) => a.cpr - b.cpr)[0] : null;
  const worstDay = validDays.length ? validDays.slice().sort((a, b) => b.cpr - a.cpr)[0] : null;
  const replyRate = funnel.connections > 0 ? (funnel.firstReply / funnel.connections * 100) : 0;
  const depthRate = funnel.connections > 0 ? (funnel.depth5 / funnel.connections * 100) : 0;

  const actions = [];
  if (scale.length) actions.push({ cls: 'inc', icon: '↑', t: `Scale ${scale.length} campaign${scale.length > 1 ? 's' : ''}`, d: scale.slice(0, 3).map(c => c.name).join(', ') + (scale.length > 3 ? '…' : '') });
  if (cut.length) actions.push({ cls: 'dec', icon: '✕', t: `Pause/Cut ${cut.length} campaign${cut.length > 1 ? 's' : ''}`, d: cut.slice(0, 3).map(c => c.name).join(', ') + (cut.length > 3 ? '…' : '') });
  if (reduce.length) actions.push({ cls: 'pau', icon: '↓', t: `Reduce ${reduce.length} campaign${reduce.length > 1 ? 's' : ''}`, d: reduce.slice(0, 3).map(c => c.name).join(', ') });
  if (bestDay && worstDay && bestDay.day !== worstDay.day) actions.push({ cls: 'inc', icon: '★', t: `Best day: ${bestDay.day}`, d: `$${bestDay.cpr.toFixed(2)}/reply vs $${worstDay.cpr.toFixed(2)} on ${worstDay.day}. Reallocate budget toward ${bestDay.day}.` });
  if (replyRate > 0 && replyRate < 50) actions.push({ cls: 'pau', icon: '!', t: `Low reply rate (${replyRate.toFixed(0)}%)`, d: 'People connect but do not reply. Check your WhatsApp welcome message.' });
  if (!actions.length) actions.push({ cls: 'mon', icon: '✓', t: 'All clear', d: 'No urgent actions. Keep monitoring.' });

  return (
    <div>
      {/* KPI strip */}
      {totals && (
        <div className="kr" style={{ marginBottom: '1.5rem' }}>
          <div className="k"><div className="l">Cost / Reply</div><div className="v" style={{ color: avgCPR < 2 ? 'var(--grn)' : avgCPR > 4 ? 'var(--red)' : 'var(--at)' }}>{$(avgCPR)}</div><div className="s">North-star metric</div></div>
          <div className="k"><div className="l">Replies</div><div className="v">{fmt(totals.tMsgs)}</div><div className="s">{fmt(totals.tMsgs / nDays, 1)}/day</div></div>
          <div className="k"><div className="l">Reply Rate</div><div className="v" style={{ color: replyRate > 65 ? 'var(--grn)' : replyRate < 50 ? 'var(--red)' : 'var(--at)' }}>{pct(replyRate, 0)}</div><div className="s">connect → reply</div></div>
          <div className="k"><div className="l">Deep Conversation</div><div className="v" style={{ color: depthRate > 35 ? 'var(--grn)' : 'var(--at)' }}>{pct(depthRate, 0)}</div><div className="s">5+ messages</div></div>
          <div className="k"><div className="l">Total Spend</div><div className="v">{$(totals.tSpend, 0)}</div><div className="s">~{$(totals.tSpend / nDays, 0)}/day</div></div>
          <div className="k"><div className="l">Best Day</div><div className="v" style={{ fontSize: '1.15rem', color: 'var(--grn)' }}>{bestDay ? bestDay.day : '—'}</div><div className="s">{bestDay ? '$' + bestDay.cpr.toFixed(2) + '/reply' : 'no data'}</div></div>
        </div>
      )}

      {/* Action center */}
      <div className="sec">
        <h2 className="sh">Action Center — What To Do Now</h2>
        <div className="vds">
          {actions.map((a, i) => (
            <div className="vd" key={i} style={{ borderLeft: `3px solid ${a.cls === 'inc' ? 'var(--grn)' : a.cls === 'dec' ? 'var(--red)' : a.cls === 'pau' ? 'var(--org)' : 'var(--pur)'}` }}>
              <span className={`tag ${a.cls}`}>{a.icon} {a.t}</span>
              <p style={{ marginTop: '.5rem' }}>{a.d}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="sec">
        <h2 className="sh">Budget Verdicts</h2>
        <div className="vds">
          {camps.filter(c => c.spend > 10).map(c => (
            <div className="vd" key={c.id}>
              <span className={`tag ${c.verdict.cls}`}>{c.verdict.label}</span>
              <h3>{c.name}</h3>
              <p>{c.verdict.r}</p>
              <div className="ms">
                <span>$/Reply: <b>{c.msgs > 0 ? $(c.spend / c.msgs) : '\u2014'}</b></span>
                <span>CTR: <b>{pct(c.ctr)}</b></span>
                <span>Msgs: <b>{fmt(c.msgs)}</b></span>
                <span>Spend: <b>{$(c.spend, 0)}</b></span>
                {c.status !== '?' && <span>{c.status}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="tc">
        <div className="cd">
          <h4>Messaging Funnel</h4>
          {funnel.connections > 0 ? (
            <div className="fn">
              {[['Connections', funnel.connections], ['First Reply', funnel.firstReply], ['2+ Msgs', funnel.depth2], ['3+ Msgs', funnel.depth3], ['5+ Msgs', funnel.depth5]].map(([l, v], i) => (
                <div className="fs" key={l}>
                  <div className="fb" style={{ width: Math.max(8, v / funnel.connections * 100) + '%', background: `rgba(167,139,250,${1 - i * 0.15})` }}>{fmt(v)}</div>
                  <span className="fl">{l}</span>
                </div>
              ))}
            </div>
          ) : <p style={{ color: 'var(--at3)' }}>No funnel data</p>}
        </div>
        <div className="cd">
          <h4>Weekly Trend</h4>
          {weekly.map((w, i) => {
            const prev = i > 0 ? weekly[i - 1].spend : null;
            const ch = prev ? ((w.spend - prev) / prev * 100) : null;
            return (
              <div key={w.start} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.4rem' }}>
                <span style={{ fontSize: '.7rem', color: 'var(--at2)', width: '72px', flexShrink: 0 }}>{w.start}</span>
                <div className="bt" style={{ maxWidth: '160px', flex: 1 }}><div className="bf o" style={{ width: Math.max(3, w.spend / maxWS * 100) + '%' }}></div></div>
                <span style={{ fontSize: '.75rem', fontWeight: 600, width: '50px', textAlign: 'right' }}>{$(w.spend, 0)}</span>
                <span style={{ fontSize: '.65rem', color: 'var(--at3)', width: '45px' }}>{fmt(w.msgs)} m</span>
                {ch !== null && <span style={{ fontSize: '.62rem', color: ch > 0 ? 'var(--grn)' : 'var(--red)', width: '40px' }}>{ch > 0 ? '+' : ''}{fmt(ch, 0)}%</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══ DAILY TAB ═══
function DailyTab({ days }) {
  const [expanded, setExpanded] = useState({});
  const toggle = (d) => setExpanded(p => ({ ...p, [d]: !p[d] }));
  const sorted = [...days].filter(d => d.spend > 0).sort((a, b) => b.date.localeCompare(a.date));
  const maxSpend = Math.max(...sorted.map(d => d.spend), 1);

  return (
    <div className="sec">
      <h2 className="sh">Daily Spend Analysis</h2>
      <p style={{ fontSize: '.78rem', color: 'var(--at2)', marginBottom: '1rem' }}>Spend per day with messaging performance</p>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Day</th>
              <th className="r">Spend</th><th className="r">Clicks</th>
              <th className="r">CTR</th><th className="r">CPC</th>
              <th className="r">Msgs</th><th className="r">$/Reply</th>
              <th style={{ width: '100px' }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(d => {
              const ctr = d.impressions > 0 ? d.clicks / d.impressions * 100 : 0;
              const cpc = d.clicks > 0 ? d.spend / d.clicks : 0;
              const cpr = d.msgs > 0 ? d.spend / d.msgs : null;
              const dayName = DOW[new Date(d.date + 'T12:00:00').getDay()].slice(0, 3);
              const isWeekend = dayName === 'Sat' || dayName === 'Sun';
              return (
                <tr key={d.date} className="day-row" style={isWeekend ? { background: 'rgba(167,139,250,.04)' } : {}}>
                  <td style={{ fontWeight: 500 }}>{d.date}</td>
                  <td style={isWeekend ? { color: 'var(--pur)' } : {}}>{dayName}</td>
                  <td className="r" style={{ fontWeight: 600 }}>{$(d.spend, 2)}</td>
                  <td className="r">{fmt(d.clicks)}</td>
                  <td className="r">{pct(ctr)}</td>
                  <td className="r">{$(cpc, 3)}</td>
                  <td className="r">{fmt(d.msgs)}</td>
                  <td className={`r ${cpr && cpr < 1.5 ? 'best' : cpr && cpr > 3 ? 'worst' : ''}`}>{cpr ? $(cpr) : '\u2014'}</td>
                  <td><div className="bt" style={{ width: '90px' }}><div className="bf o" style={{ width: Math.max(2, d.spend / maxSpend * 100) + '%' }}></div></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══ ADS TAB ═══
function AdsTab({ ads }) {
  const maxSpend = Math.max(...ads.map(a => a.spend), 1);
  return (
    <div className="sec">
      <h2 className="sh">Individual Ad Performance</h2>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Ad Name</th><th>Campaign</th>
              <th className="r">Spend</th><th className="r">Impressions</th>
              <th className="r">Clicks</th><th className="r">CTR</th>
              <th className="r">CPC</th><th className="r">CPM</th>
              <th style={{ width: '100px' }}></th>
            </tr>
          </thead>
          <tbody>
            {ads.map((a, i) => (
              <tr key={a.id || i}>
                <td>{i + 1}</td>
                <td style={{ fontWeight: 500, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</td>
                <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '.72rem', color: 'var(--at2)' }}>{a.campName}</td>
                <td className="r" style={{ fontWeight: 600 }}>{$(a.spend, 2)}</td>
                <td className="r">{fmt(a.impressions)}</td>
                <td className="r">{fmt(a.clicks)}</td>
                <td className={`r ${a.ctr > 5 ? 'best' : a.ctr < 2 ? 'worst' : ''}`}>{pct(a.ctr)}</td>
                <td className={`r ${a.cpc < 0.03 ? 'best' : a.cpc > 0.1 ? 'worst' : ''}`}>{$(a.cpc, 3)}</td>
                <td className="r">{$(a.cpm)}</td>
                <td><div className="bt" style={{ width: '90px' }}><div className={`bf ${a.ctr > 5 ? 'g' : a.ctr > 3 ? 'b' : a.ctr > 2 ? 'o' : 'r'}`} style={{ width: Math.max(2, a.spend / maxSpend * 100) + '%' }}></div></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══ RECOMMENDATIONS TAB ═══
function RecsTab({ ads, camps, tSpend, nDays }) {
  const tImps = ads.reduce((s, a) => s + a.impressions, 0);
  const tClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const tAdSpend = ads.reduce((s, a) => s + a.spend, 0);
  const avgCTR = tImps > 0 ? tClicks / tImps * 100 : 0;
  const avgCPC = tClicks > 0 ? tAdSpend / tClicks : 0;
  const avgCPM = tImps > 0 ? tAdSpend / tImps * 1000 : 0;
  const dailyBudget = tSpend / nDays;

  const scored = ads.filter(a => a.spend > 0).map(a => {
    const ctrR = avgCTR > 0 ? a.ctr / avgCTR : 1;
    const cpcR = avgCPC > 0 ? avgCPC / a.cpc : 1;
    const cpmR = avgCPM > 0 ? avgCPM / a.cpm : 1;
    const score = Math.round((ctrR * 40 + cpcR * 35 + cpmR * 25) / 3 * 100) / 100;
    const dSpend = a.spend / nDays;
    let tier, cls, actCls, reason, action;

    if (a.spend < 15) {
      if (a.ctr > avgCTR * 1.5 && a.cpc < avgCPC * 0.5) {
        tier = 'scale'; cls = 'scale'; actCls = 'g';
        reason = `Incredible early signals — ${pct(a.ctr)} CTR and ${$(a.cpc, 3)} CPC are the best ratios. Only ${$(a.spend)} spent, still in learning phase.`;
        action = `Increase to $15-20/day. Give 7+ days to exit learning phase.`;
      } else {
        tier = 'dead'; cls = 'dead'; actCls = 'x';
        reason = `Negligible spend (${$(a.spend)}) with ${pct(a.ctr)} CTR. Not enough data.`;
        action = `No action — too small to matter.`;
      }
    } else if (a.ctr > avgCTR * 1.4 && a.cpc < avgCPC * 0.6) {
      tier = 'scale'; cls = 'scale'; actCls = 'g';
      reason = `Top performer. ${pct(a.ctr)} CTR is ${ctrR.toFixed(1)}x account avg. Every dollar generates more clicks than average.`;
      action = dSpend < dailyBudget * 0.3 ? `Increase daily budget by 50-100%. Underinvested relative to efficiency.` : `Good budget share. Maintain and watch for creative fatigue.`;
    } else if (a.ctr > avgCTR * 1.1 && a.cpc < avgCPC * 0.8) {
      tier = 'scale'; cls = 'scale'; actCls = 'g';
      reason = `Above-average — ${pct(a.ctr)} CTR and ${$(a.cpc, 3)} CPC both beat benchmarks.`;
      action = `Increase budget by 25-50%. Good scale candidate.`;
    } else if (a.ctr > avgCTR * 0.7 && a.cpc < avgCPC * 1.3) {
      tier = 'optimize'; cls = 'optimize'; actCls = 'o';
      reason = `Middle of pack — ${pct(a.ctr)} CTR and ${$(a.cpc, 3)} CPC near averages. ${fmt(a.clicks)} clicks for ${$(a.spend)}.`;
      action = `Reduce to $5/day. Shift budget to top performers.`;
    } else if (a.ctr < avgCTR * 0.5 || a.cpc > avgCPC * 2) {
      tier = 'cut'; cls = 'cut'; actCls = 'r';
      const wp = tAdSpend > 0 ? (a.spend / tAdSpend * 100).toFixed(0) : 0;
      reason = `Underperforming — ${pct(a.ctr)} CTR and ${$(a.cpc, 3)} CPC both below benchmarks. Consumed ${wp}% of budget with poor efficiency.`;
      action = `Pause immediately. Redirect ${$(dSpend, 0)}/day to top performers.`;
    } else {
      tier = 'cut'; cls = 'cut'; actCls = 'r';
      reason = `Below average — ${pct(a.ctr)} CTR and ${$(a.cpc, 3)} CPC both worse than benchmarks.`;
      action = `Reduce significantly or pause.`;
    }

    const camp = camps.find(c => c.id === a.campId);
    const isPaused = camp && camp.status === 'PAUSED';
    if (isPaused && (tier === 'scale' || tier === 'optimize')) {
      tier = 'reactivate'; cls = 'reactivate'; actCls = 'b';
      action = `Campaign paused but ad was performing. Reactivate at $15-20/day.`;
    }

    return { ...a, score, tier, cls, actCls, reason, action, dSpend, isPaused };
  });

  const tOrder = { scale: 0, reactivate: 1, optimize: 2, cut: 3, dead: 4 };
  scored.sort((a, b) => tOrder[a.tier] - tOrder[b.tier] || b.score - a.score);
  const groups = { scale: [], reactivate: [], optimize: [], cut: [], dead: [] };
  scored.forEach(a => groups[a.tier].push(a));
  const tLabels = { scale: 'Scale / increase budget', reactivate: 'Reactivate', optimize: 'Optimize / reduce', cut: 'Pause / cut', dead: 'Low priority' };

  return (
    <div className="sec">
      <h2 className="sh">Ad-Level Recommendations</h2>
      <p style={{ fontSize: '.84rem', color: 'var(--at2)', marginBottom: '1rem', lineHeight: 1.6 }}>
        Each ad scored against benchmarks — CTR avg: {pct(avgCTR)}, CPC avg: {$(avgCPC, 3)}, CPM avg: {$(avgCPM)}
      </p>
      {Object.entries(groups).map(([tier, items]) => items.length > 0 && (
        <div key={tier}>
          <div className="sec-label">{tLabels[tier]} ({items.length})</div>
          {items.map(a => (
            <div className={`rec ${a.cls}`} key={a.id}>
              <div className="rec-top">
                <div>
                  <div className="rec-name">{a.name}</div>
                  <div className="rec-camp">{a.campName} {a.isPaused && <span className="tag pau" style={{ marginLeft: 6 }}>paused</span>}</div>
                </div>
                <span className={`tag ${a.tier === 'scale' || a.tier === 'reactivate' ? 'inc' : a.tier === 'optimize' ? 'pau' : 'dec'}`}>
                  {a.tier === 'scale' ? 'Scale' : a.tier === 'reactivate' ? 'Reactivate' : a.tier === 'optimize' ? 'Optimize' : a.tier === 'cut' ? 'Pause' : 'Low priority'}
                </span>
              </div>
              <div className="rec-stats">
                <span>Spend: <b>{$(a.spend, 0)}</b></span>
                <span>CTR: <b>{pct(a.ctr)}</b></span>
                <span>CPC: <b>{$(a.cpc, 3)}</b></span>
                <span>CPM: <b>{$(a.cpm)}</b></span>
                <span>Clicks: <b>{fmt(a.clicks)}</b></span>
                <span>~{$(a.dSpend, 0)}/day</span>
              </div>
              <div className="rec-why">{a.reason}</div>
              <div className={`rec-action ${a.actCls}`}>{a.action}</div>
              <div className="rec-score">Efficiency score: {a.score}/100</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ═══ TRACKER TAB ═══
function TrackerTab({ ads, tSpend, tMsgs, bCTR, bCPM, tReach, nDays }) {
  const STORAGE_KEY = 'sahiba_snapshots';
  const [snaps, setSnaps] = useState(() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } });
  const [compareIdx, setCompareIdx] = useState(0);

  const saveSnaps = (s) => { setSnaps(s); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {} };

  const takeSnapshot = () => {
    const now = new Date();
    const snap = {
      id: Date.now(),
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString(),
      label: 'Snapshot ' + now.toLocaleDateString(),
      nDays,
      account: {
        tSpend, tMsgs, bCTR, bCPM, tReach,
        avgCPC: ads.reduce((s, a) => s + a.clicks, 0) > 0 ? ads.reduce((s, a) => s + a.spend, 0) / ads.reduce((s, a) => s + a.clicks, 0) : 0,
        dailySpend: tSpend / nDays,
        cpr: tMsgs > 0 ? tSpend / tMsgs : null
      },
      ads: ads.map(a => ({ id: a.id, name: a.name, campName: a.campName, spend: a.spend, impressions: a.impressions, clicks: a.clicks, ctr: a.ctr, cpc: a.cpc, cpm: a.cpm, reach: a.reach }))
    };
    saveSnaps([snap, ...snaps]);
  };

  const deleteSnap = (id) => { saveSnaps(snaps.filter(s => s.id !== id)); };

  const delta = (now, before, invert) => {
    if (before === 0 || before == null) return { val: null, cls: 'flat' };
    const d = ((now - before) / before * 100);
    const cls = invert ? (d < 0 ? 'up' : d > 0 ? 'dn' : 'flat') : (d > 0 ? 'up' : d < 0 ? 'dn' : 'flat');
    return { val: d, cls };
  };

  const DeltaSpan = ({ now, before, invert }) => {
    const { val, cls } = delta(now, before, invert);
    if (val === null) return <span className="delta flat">new</span>;
    return <span className={`delta ${cls}`}>{val > 0 ? '+' : ''}{val.toFixed(1)}%</span>;
  };

  const baseline = snaps.length > 0 ? snaps[compareIdx] : null;

  return (
    <div className="sec">
      <h2 className="sh">Performance Tracker</h2>
      <div className="tracker-hdr">
        <p>Take snapshots to track performance over time. Each snapshot saves the current state so you can compare before vs after.</p>
        <button className="snap-btn" onClick={takeSnapshot}>Take Snapshot Now</button>
      </div>

      {baseline && (
        <div>
          <div className="snap-info">
            Comparing current data against <b>{baseline.label}</b> taken on <b>{baseline.date}</b> at {baseline.time}
            {snaps.length > 1 && (
              <span style={{ marginLeft: 12 }}>
                <select value={compareIdx} onChange={e => setCompareIdx(parseInt(e.target.value))} style={{ background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '2px 6px', borderRadius: 4, fontSize: '.78rem' }}>
                  {snaps.map((s, i) => <option key={s.id} value={i}>{s.label} ({s.date})</option>)}
                </select>
              </span>
            )}
          </div>
          <div className="compare-grid">
            {[
              ['Daily Spend', $(tSpend / nDays, 0), <DeltaSpan now={tSpend / nDays} before={baseline.account.dailySpend} />],
              ['CTR', pct(bCTR), <DeltaSpan now={bCTR} before={baseline.account.bCTR} />],
              ['CPM', $(bCPM), <DeltaSpan now={bCPM} before={baseline.account.bCPM} invert={true} />],
              ['Messages', fmt(tMsgs), <DeltaSpan now={tMsgs} before={baseline.account.tMsgs} />],
              ['$/Reply', tMsgs > 0 ? $(tSpend / tMsgs) : '\u2014', tMsgs > 0 && baseline.account.cpr ? <DeltaSpan now={tSpend / tMsgs} before={baseline.account.cpr} invert={true} /> : <span className="delta flat">\u2014</span>],
            ].map(([label, val, d], i) => (
              <div className="compare-card" key={i}>
                <div className="cl">{label}</div>
                <div className="cv">{val}</div>
                <div>{d}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!baseline && <div className="es" style={{ padding: '3rem 2rem' }}><h2>No snapshots yet</h2><p>Click "Take Snapshot Now" to save today's baseline.</p></div>}

      {snaps.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3 className="sh" style={{ fontSize: '1rem' }}>Saved Snapshots ({snaps.length})</h3>
          <div className="snap-list">
            {snaps.map((s, i) => (
              <div className="snap-item" key={s.id}>
                <div>
                  <span className="snap-date">{s.label}</span><br />
                  <span className="snap-meta">{s.date} at {s.time} · {s.ads.length} ads · {$(s.account.tSpend, 0)} total</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {i !== compareIdx && <button onClick={() => setCompareIdx(i)}>Compare</button>}
                  {i === compareIdx && <span className="tag inc" style={{ fontSize: '.68rem' }}>Active</span>}
                  <button onClick={() => { if (confirm('Delete this snapshot?')) deleteSnap(s.id); }} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ MESSAGING DEPTH TAB ═══
function DepthTab({ ads }) {
  // Filter ads that have meaningful messaging data
  const withMsgs = ads.filter(a => a.spend > 5 && a.connections > 0);
  if (withMsgs.length === 0) return <div className="es"><h2>No messaging data</h2><p>No ads with messaging connections in this period.</p></div>;

  // Sort by $/reply ascending (best first)
  const sorted = [...withMsgs].sort((a, b) => (a.costPerReply || 9999) - (b.costPerReply || 9999));

  // Compute auto-labels
  const bestCPR = sorted[0];
  const bestLeadGen = [...withMsgs].sort((a, b) => b.firstReply - a.firstReply)[0];
  const labeled = sorted.map(a => {
    let label = null, labelColor = null;
    if (a.id === bestLeadGen.id && a.firstReply >= 50) { label = 'Best lead gen'; labelColor = 'g'; }
    else if (a.id === bestCPR.id && a.costPerReply < 2) { label = 'Best $/reply'; labelColor = 'g'; }
    else if (a.replyRate < 50 && a.clicks > 50) { label = 'High click, low msg'; labelColor = 'o'; }
    else if (a.costPerReply && a.costPerReply > 4) { label = 'Expensive replies'; labelColor = 'r'; }
    else if (a.depthRate > 40) { label = 'Deep conversations'; labelColor = 'g'; }
    else label = 'Average';
    return { ...a, label, labelColor };
  });

  // Totals
  const totals = labeled.reduce((t, a) => ({
    spend: t.spend + a.spend,
    connections: t.connections + a.connections,
    firstReply: t.firstReply + a.firstReply,
    depth2: t.depth2 + a.depth2,
    depth3: t.depth3 + a.depth3,
    depth5: t.depth5 + a.depth5,
  }), { spend: 0, connections: 0, firstReply: 0, depth2: 0, depth3: 0, depth5: 0 });
  totals.costPerReply = totals.firstReply > 0 ? totals.spend / totals.firstReply : null;
  totals.costPer5Msg = totals.depth5 > 0 ? totals.spend / totals.depth5 : null;
  totals.replyRate = totals.connections > 0 ? totals.firstReply / totals.connections * 100 : 0;
  totals.depthRate = totals.connections > 0 ? totals.depth5 / totals.connections * 100 : 0;

  const maxConn = Math.max(...labeled.map(a => a.connections), 1);

  const tagStyle = (color) => ({
    background: color === 'g' ? 'rgba(74,222,128,.12)' : color === 'r' ? 'rgba(248,113,113,.12)' : color === 'o' ? 'rgba(251,146,60,.12)' : 'rgba(167,139,250,.12)',
    color: color === 'g' ? 'var(--grn)' : color === 'r' ? 'var(--red)' : color === 'o' ? 'var(--org)' : 'var(--pur)',
    padding: '.25rem .7rem',
    borderRadius: '12px',
    fontSize: '.7rem',
    fontWeight: 600,
    whiteSpace: 'nowrap'
  });

  const barColor = (color, shade) => {
    if (color === 'g') return `rgba(74,222,128,${shade})`;
    if (color === 'r') return `rgba(248,113,113,${shade})`;
    if (color === 'o') return `rgba(251,146,60,${shade})`;
    return `rgba(167,139,250,${shade})`;
  };

  return (
    <div>
      {/* Cards grid */}
      <div className="sec">
        <h2 className="sh">Conversation Quality — Per Ad</h2>
        <p style={{ fontSize: '.8rem', color: 'var(--at2)', marginBottom: '1rem' }}>
          For each ad: how many people connected, replied, and had deep conversations. Higher depth = more engaged leads.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {labeled.map(a => {
            const stages = [
              { label: 'Connections', val: a.connections, shade: 0.9 },
              { label: 'First reply', val: a.firstReply, shade: 0.75 },
              { label: '2+ msgs', val: a.depth2, shade: 0.6 },
              { label: '3+ msgs', val: a.depth3, shade: 0.45 },
              { label: '5+ msgs', val: a.depth5, shade: 0.3 },
            ];
            return (
              <div key={a.id} style={{ background: 'var(--as1)', border: '1px solid var(--abdr)', borderRadius: 12, padding: '1.1rem 1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: '.8rem' }}>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>{a.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--at2)', marginTop: 2 }}>{a.campName}</div>
                  </div>
                  {a.label && <span style={tagStyle(a.labelColor)}>{a.label}</span>}
                </div>

                {/* Stacked bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', marginBottom: '.8rem' }}>
                  {stages.map(s => {
                    const pct = maxConn > 0 ? (s.val / maxConn * 100) : 0;
                    return (
                      <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                        <div style={{ flex: 1, height: 22, background: 'rgba(255,255,255,.03)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: Math.max(3, pct) + '%',
                            background: barColor(a.labelColor, s.shade),
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '.5rem',
                            fontSize: '.72rem',
                            fontWeight: 600,
                            color: 'var(--at)'
                          }}>{fmt(s.val)}</div>
                        </div>
                        <span style={{ fontSize: '.72rem', color: 'var(--at2)', width: 80 }}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Metrics footer */}
                <div style={{ borderTop: '1px solid var(--abdr)', paddingTop: '.6rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.4rem .8rem', fontSize: '.72rem', color: 'var(--at2)' }}>
                  <div>Spend: <b style={{ color: 'var(--at)' }}>{$(a.spend, 0)}</b></div>
                  <div>$/reply: <b style={{ color: a.costPerReply < 2 ? 'var(--grn)' : a.costPerReply > 4 ? 'var(--red)' : 'var(--at)' }}>{a.costPerReply ? $(a.costPerReply) : '\u2014'}</b></div>
                  <div>$/5+msg: <b style={{ color: 'var(--at)' }}>{a.costPer5Msg ? $(a.costPer5Msg) : '\u2014'}</b></div>
                  <div>Reply rate: <b style={{ color: a.replyRate > 70 ? 'var(--grn)' : a.replyRate < 50 ? 'var(--red)' : 'var(--at)' }}>{a.replyRate.toFixed(0)}%</b></div>
                  <div>Depth rate: <b style={{ color: a.depthRate > 40 ? 'var(--grn)' : 'var(--at)' }}>{a.depthRate.toFixed(0)}%</b></div>
                  <div>Clicks: <b style={{ color: 'var(--at)' }}>{fmt(a.clicks)}</b></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary Table */}
      <div className="sec">
        <h2 className="sh">Ad-Level Summary Table</h2>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Ad</th>
                <th className="r">Spend</th>
                <th className="r">Connections</th>
                <th className="r">1st Reply</th>
                <th className="r">2+ Msg</th>
                <th className="r">3+ Msg</th>
                <th className="r">5+ Msg</th>
                <th className="r">$/Reply</th>
                <th className="r">$/5+Msg</th>
                <th className="r">Reply %</th>
                <th className="r">Depth %</th>
              </tr>
            </thead>
            <tbody>
              {labeled.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</td>
                  <td className="r">{$(a.spend, 0)}</td>
                  <td className="r">{fmt(a.connections)}</td>
                  <td className="r">{fmt(a.firstReply)}</td>
                  <td className="r">{fmt(a.depth2)}</td>
                  <td className="r">{fmt(a.depth3)}</td>
                  <td className="r">{fmt(a.depth5)}</td>
                  <td className={`r ${a.costPerReply && a.costPerReply < 2 ? 'best' : a.costPerReply && a.costPerReply > 4 ? 'worst' : ''}`}>{a.costPerReply ? $(a.costPerReply) : '\u2014'}</td>
                  <td className="r">{a.costPer5Msg ? $(a.costPer5Msg) : '\u2014'}</td>
                  <td className={`r ${a.replyRate > 70 ? 'best' : a.replyRate < 50 ? 'worst' : ''}`}>{a.replyRate.toFixed(0)}%</td>
                  <td className={`r ${a.depthRate > 40 ? 'best' : a.depthRate < 15 ? 'worst' : ''}`}>{a.depthRate.toFixed(0)}%</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: '2px solid var(--abdr)', background: 'var(--as2)' }}>
                <td>Total</td>
                <td className="r">{$(totals.spend, 0)}</td>
                <td className="r">{fmt(totals.connections)}</td>
                <td className="r">{fmt(totals.firstReply)}</td>
                <td className="r">{fmt(totals.depth2)}</td>
                <td className="r">{fmt(totals.depth3)}</td>
                <td className="r">{fmt(totals.depth5)}</td>
                <td className="r">{totals.costPerReply ? $(totals.costPerReply) : '\u2014'}</td>
                <td className="r">{totals.costPer5Msg ? $(totals.costPer5Msg) : '\u2014'}</td>
                <td className="r">{totals.replyRate.toFixed(0)}%</td>
                <td className="r">{totals.depthRate.toFixed(0)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '.72rem', color: 'var(--at3)', marginTop: '.8rem', lineHeight: 1.6 }}>
          <b>* 5+ msgs can exceed connections</b> because depth-5 counts messages from previously connected users returning to chat. High depth rate means legacy conversations are re-engaging.<br />
          <b>Depth %</b> = 5+ messages / connections. Higher = more engaged conversations.<br />
          <b>Reply %</b> = first reply / connections. Shows how many connected users actually respond.
        </p>
      </div>
    </div>
  );
}

// ═══ DAY OF WEEK TAB ═══
// ═══ BEST DAYS TAB ═══
function BestDaysTab({ dowRich }) {
  if (!dowRich || !dowRich.rows) {
    return <div className="es"><h2>Not enough data</h2><p>Pick a 30, 90 or 120-day range to see which weekdays perform best.</p></div>;
  }
  const { rows, periodAvgCPR, bestDays, worstDays, budgetPlan, lookbackDays } = dowRich;
  const valid = rows.filter(r => !r.noData && r.cpr != null);
  if (valid.length === 0) {
    return <div className="es"><h2>No replies recorded</h2><p>No messaging data in this period. Widen the date range.</p></div>;
  }

  // Order Mon→Sun for display
  const order = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const ordered = order.map(d => rows.find(r => r.day === d)).filter(Boolean);
  const bestRow = valid.slice().sort((a, b) => a.cpr - b.cpr)[0];
  const worstRow = valid.slice().sort((a, b) => b.cpr - a.cpr)[0];

  return (
    <div>
      {/* Hero recommendation */}
      <div className="sec">
        <h2 className="sh">Best Days To Invest</h2>
        <p style={{ fontSize: '.8rem', color: 'var(--at2)', marginBottom: '1rem' }}>
          Based on {lookbackDays} days with spend. Average cost per reply is <b style={{ color: 'var(--at)' }}>${periodAvgCPR ? periodAvgCPR.toFixed(2) : '—'}</b>.
        </p>
        <div className="compare-grid">
          <div className="compare-card" style={{ borderColor: 'rgba(74,222,128,.4)' }}>
            <div className="cl">Best day</div>
            <div className="cv" style={{ color: 'var(--grn)' }}>{bestRow.day}</div>
            <div style={{ fontSize: '.72rem', color: 'var(--at3)', marginTop: '.3rem' }}>${bestRow.cpr.toFixed(2)}/reply · {fmt(bestRow.avgMsgs, 1)} msgs/day</div>
          </div>
          <div className="compare-card" style={{ borderColor: 'rgba(248,113,113,.4)' }}>
            <div className="cl">Worst day</div>
            <div className="cv" style={{ color: 'var(--red)' }}>{worstRow.day}</div>
            <div style={{ fontSize: '.72rem', color: 'var(--at3)', marginTop: '.3rem' }}>${worstRow.cpr.toFixed(2)}/reply · {fmt(worstRow.avgMsgs, 1)} msgs/day</div>
          </div>
          <div className="compare-card">
            <div className="cl">Days to scale</div>
            <div className="cv" style={{ color: 'var(--grn)', fontSize: '1rem' }}>{bestDays.join(', ')}</div>
          </div>
          <div className="compare-card">
            <div className="cl">Days to pause</div>
            <div className="cv" style={{ color: 'var(--red)', fontSize: '1rem' }}>{worstDays.join(', ')}</div>
          </div>
        </div>
      </div>

      {/* Weekday table */}
      <div className="sec">
        <h2 className="sh">Performance By Day Of Week</h2>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th className="r">Weeks</th>
                <th className="r">Spend/Day</th>
                <th className="r">Messages/Day</th>
                <th className="r">Connections/Day</th>
                <th className="r">$/Reply</th>
                <th className="r">Reply %</th>
                <th style={{ width: '110px' }}>Efficiency</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map(d => {
                if (d.noData || d.cpr == null) return (
                  <tr key={d.day}><td style={{ fontWeight: 600 }}>{d.day}</td><td colSpan="8" style={{ color: 'var(--at3)', fontSize: '.78rem' }}>No data</td></tr>
                );
                const isBest = d.day === bestRow.day;
                const isWorst = d.day === worstRow.day;
                return (
                  <tr key={d.day}>
                    <td style={{ fontWeight: 600 }}>{d.day} {isBest && '⭐'}</td>
                    <td className="r">{d.weeks}</td>
                    <td className="r">{$(d.avgSpend, 0)}</td>
                    <td className="r">{fmt(d.avgMsgs, 1)}</td>
                    <td className="r">{fmt(d.avgConnections, 1)}</td>
                    <td className={`r ${isBest ? 'best' : isWorst ? 'worst' : ''}`}>{$(d.cpr)}</td>
                    <td className="r">{pct(d.replyRate, 0)}</td>
                    <td><div className="bt" style={{ width: '100px' }}><div className={`bf ${d.score > 66 ? 'g' : d.score > 33 ? 'o' : 'r'}`} style={{ width: Math.max(5, d.score) + '%' }}></div></div></td>
                    <td><span className={`tag ${d.actionCls}`}>{d.action}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Budget reallocation plan */}
      <div className="sec">
        <h2 className="sh">Budget Reallocation Plan</h2>
        <p style={{ fontSize: '.8rem', color: 'var(--at2)', marginBottom: '1rem' }}>
          Same total budget, shifted toward the cheaper days. Use this to set your ad scheduling.
        </p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th className="r">Current Spend (total)</th>
                <th className="r">Suggested Spend</th>
                <th className="r">Change</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {order.map(dayName => {
                const b = budgetPlan.find(x => x.day === dayName);
                const r = rows.find(x => x.day === dayName);
                if (!b || !r || r.noData) return null;
                const up = b.change > 0;
                return (
                  <tr key={dayName}>
                    <td style={{ fontWeight: 600 }}>{dayName}</td>
                    <td className="r">{$(b.current, 0)}</td>
                    <td className="r" style={{ fontWeight: 600 }}>{$(b.suggested, 0)}</td>
                    <td className={`r delta ${up ? 'up' : b.change < 0 ? 'dn' : 'flat'}`}>{up ? '+' : ''}{$(b.change, 0)}</td>
                    <td style={{ fontSize: '.78rem', color: 'var(--at2)' }}>{r.rec || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="snap-info" style={{ marginTop: '1rem' }}>
          <b>How to apply this:</b> In Meta Ads Manager → Ad Set → "Ad Scheduling" (requires lifetime budget).
          Run ads only on the green days and pause or reduce the red days. This lowers your cost per reply without spending more.
        </div>
      </div>
    </div>
  );
}

// ═══ HOUR OF DAY TAB ═══
function fmtRange(hrs) {
  if (!hrs || !hrs.length) return '—';
  const s = [...hrs].sort((a, b) => a - b);
  const ranges = [];
  let start = s[0], prev = s[0];
  for (let i = 1; i < s.length; i++) {
    if (s[i] === prev + 1) { prev = s[i]; continue; }
    ranges.push([start, prev]); start = s[i]; prev = s[i];
  }
  ranges.push([start, prev]);
  return ranges.map(([a, b]) => `${String(a).padStart(2,'0')}:00–${String((b+1)%24).padStart(2,'0')}:00`).join(', ');
}

function HourTab({ hourRich }) {
  if (!hourRich || !hourRich.rows) {
    return <div className="es"><h2>No hourly data</h2><p>Meta did not return an hourly breakdown for this period. Try a 14 or 30-day range, or check the Pipeboard connection.</p></div>;
  }
  const { rows, avgCPR, bestHours, worstHours, onHours, offHours, dataDays } = hourRich;
  const valid = rows.filter(r => r.cpr != null);
  if (!valid.length) return <div className="es"><h2>No replies by hour</h2><p>No messaging replies recorded by hour in this period.</p></div>;

  const maxSpend = Math.max(...rows.map(r => r.spend), 1);
  const tierColor = { prime: 'var(--grn)', ok: 'var(--blu)', weak: 'var(--org)', dead: 'var(--red)', none: 'var(--at3)' };
  const tierLabel = { prime: 'PRIME', ok: 'OK', weak: 'WEAK', dead: 'DEAD', none: 'NO DATA' };

  return (
    <div>
      <div className="sec">
        <h2 className="sh">Best Hours To Run Ads</h2>
        <p style={{ fontSize: '.8rem', color: 'var(--at2)', marginBottom: '1rem' }}>
          Hour of day in your account timezone, across {dataDays} days. Average cost per reply is <b style={{ color: 'var(--at)' }}>${avgCPR ? avgCPR.toFixed(2) : '—'}</b>.
        </p>
        <div className="compare-grid">
          <div className="compare-card" style={{ borderColor: 'rgba(74,222,128,.4)' }}>
            <div className="cl">Cheapest hours</div>
            <div className="cv" style={{ color: 'var(--grn)', fontSize: '1rem' }}>{bestHours.join(', ')}</div>
          </div>
          <div className="compare-card" style={{ borderColor: 'rgba(248,113,113,.4)' }}>
            <div className="cl">Most expensive hours</div>
            <div className="cv" style={{ color: 'var(--red)', fontSize: '1rem' }}>{worstHours.join(', ')}</div>
          </div>
          <div className="compare-card">
            <div className="cl">Suggested ON window</div>
            <div className="cv" style={{ color: 'var(--grn)', fontSize: '.85rem' }}>{fmtRange(onHours)}</div>
          </div>
          <div className="compare-card">
            <div className="cl">Suggested OFF window</div>
            <div className="cv" style={{ color: 'var(--red)', fontSize: '.85rem' }}>{fmtRange(offHours)}</div>
          </div>
        </div>
      </div>

      {/* 24h efficiency strip */}
      <div className="sec">
        <h2 className="sh">24-Hour Efficiency</h2>
        <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px', padding: '0 0 1.5rem' }}>
          {rows.map(r => (
            <div key={r.hour} title={`${r.label} · $${r.cpr ? r.cpr.toFixed(2) : '—'}/reply · ${r.msgs} msgs`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
              <div style={{
                width: '100%',
                height: Math.max(4, (r.score / 100) * 90) + 'px',
                background: tierColor[r.tier] || 'var(--at3)',
                borderRadius: '3px 3px 0 0',
                opacity: r.cpr == null ? 0.25 : 1
              }} />
              <span style={{ fontSize: '.55rem', color: 'var(--at3)' }}>{String(r.hour).padStart(2,'0')}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '.7rem', color: 'var(--at2)' }}>
          <span><b style={{ color: 'var(--grn)' }}>■</b> Prime</span>
          <span><b style={{ color: 'var(--blu)' }}>■</b> OK</span>
          <span><b style={{ color: 'var(--org)' }}>■</b> Weak</span>
          <span><b style={{ color: 'var(--red)' }}>■</b> Dead</span>
        </div>
      </div>

      {/* Hour table */}
      <div className="sec">
        <h2 className="sh">Hour-By-Hour Breakdown</h2>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Hour</th>
                <th className="r">Spend</th>
                <th className="r">Clicks</th>
                <th className="r">Replies</th>
                <th className="r">$/Reply</th>
                <th className="r">Reply %</th>
                <th style={{ width: '110px' }}>Spend share</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.hour}>
                  <td style={{ fontWeight: 600 }}>{r.label}</td>
                  <td className="r">{$(r.spend, 0)}</td>
                  <td className="r">{fmt(r.clicks)}</td>
                  <td className="r">{fmt(r.msgs)}</td>
                  <td className={`r ${r.tier === 'prime' ? 'best' : r.tier === 'dead' ? 'worst' : ''}`}>{r.cpr != null ? $(r.cpr) : '—'}</td>
                  <td className="r">{pct(r.replyRate, 0)}</td>
                  <td><div className="bt" style={{ width: '100px' }}><div className="bf o" style={{ width: Math.max(2, r.spend / maxSpend * 100) + '%' }}></div></div></td>
                  <td><span className="tag" style={{ background: 'rgba(255,255,255,.06)', color: tierColor[r.tier] }}>{tierLabel[r.tier]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="snap-info" style={{ marginTop: '1rem' }}>
          <b>How to use this:</b> Go to the <b>Schedule</b> tab to apply an automatic on/off schedule based on these hours,
          or set it manually in Meta Ads Manager → Ad Set → Ad Scheduling (requires lifetime budget).
        </div>
      </div>
    </div>
  );
}

// ═══ SALES & ROI TAB ═══
function TikTokTab() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = useCallback((d) => {
    setLoading(true);
    api.getTiktokSummary(d).then(setData).catch(e => setData({ ok: false, error: e.message })).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(days); }, [load, days]);

  if (loading) return <div className="ld"><div className="sp"></div><p>Loading TikTok summary…</p></div>;
  if (!data || !data.ok) return <div className="sec"><h2 className="sh">TikTok</h2><div className="err">Error: {data?.error || 'no data'}</div></div>;

  const a = data.advertiser;
  const $u = (n, dec = 0) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const mx = n => '$' + Math.round(n || 0).toLocaleString('en-US') + ' MXN';
  const statusColor = s => s === 'STATUS_ENABLE' ? 'var(--grn)' : 'var(--at3)';

  return (
    <>
      <div className="sec">
        <h2 className="sh">🎵 TikTok — {a?.name || 'Loading'} ({a?.company || ''})</h2>
        <p style={{ fontSize: '.78rem', color: 'var(--at2)', marginBottom: '.75rem' }}>
          Live data from your TikTok Ad Account via Pipeboard. Window: last {data.window.days} days ({data.window.start_date} → {data.window.end_date}).
          Account currency: <b>{a?.currency || '?'}</b> · TZ: {a?.timezone || '?'} · Balance: {mx(a?.balance || 0)}
        </p>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <label style={{ fontSize: '.75rem', color: 'var(--at2)' }}>Window:</label>
          {[7, 14, 30, 60, 90].map(d => (
            <button key={d} className={`tab ${days === d ? 'active' : ''}`} onClick={() => setDays(d)} style={{ padding: '.3rem .75rem', fontSize: '.75rem' }}>{d}d</button>
          ))}
        </div>

        <div className="kr">
          <div className="k">
            <div className="l">Account Status</div>
            <div className="v" style={{ color: statusColor(a?.status), fontSize: '1rem' }}>{a?.status === 'STATUS_ENABLE' ? '🟢 Active' : a?.status || '?'}</div>
            <div className="s">{a?.account_type || ''} · {a?.country || '?'}</div>
          </div>
          <div className="k">
            <div className="l">Campaigns ({data.window.days}d)</div>
            <div className="v" style={{ color: data.campaign_count ? 'var(--grn)' : 'var(--at3)' }}>{data.campaign_count}</div>
            <div className="s">{data.campaign_count === 0 ? 'no ads yet' : `${data.campaigns.filter(c => c.status === 'ENABLE').length} enabled`}</div>
          </div>
          <div className="k">
            <div className="l">Spend ({data.window.days}d)</div>
            <div className="v" style={{ color: 'var(--grn)' }}>{mx(data.spend.total_mxn)}</div>
            <div className="s">{$u((data.spend.total_mxn || 0) / 18, 0)} USD equiv @ 18</div>
          </div>
          <div className="k">
            <div className="l">TikTok Shop Vouchers</div>
            <div className="v" style={{ color: 'var(--gold)' }}>{mx(data.tiktok_shop_voucher_mxn)}</div>
            <div className="s">~${(data.tiktok_shop_voucher_mxn / 18).toLocaleString('en-US', {maximumFractionDigits: 0})} USD free ad credit available</div>
          </div>
        </div>
      </div>

      {data.campaign_count === 0 ? (
        <div className="sec">
          <h2 className="sh">No campaigns yet — ready to launch your first TikTok ad</h2>
          <p style={{ fontSize: '.85rem', color: 'var(--at2)' }}>{data.note}</p>
          <div className="snap-info" style={{ marginTop: '1rem', borderLeftColor: 'var(--gold)' }}>
            <b style={{ color: 'var(--gold)' }}>🎯 Recommended first move (Phase 4)</b>
            <p style={{ margin: '.4rem 0 0', fontSize: '.78rem' }}>
              Boost an existing organic TikTok video as a <b>Spark Ad</b> targeted at beach cities (Cancún, Mérida, Playa del Carmen).
              Conservative $5-10/day for 14 days. Pay with the MX$57,000 voucher pool — zero out-of-pocket cost.
              The "Launch TikTok Campaign" wizard tab is coming soon — for now, use TikTok Ads Manager directly.
            </p>
            <a href={`https://ads.tiktok.com/i18n/dashboard?aadvid=${a?.id || ''}`} target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', marginTop: '.6rem', background: 'var(--gold)', color: '#000', padding: '.5rem 1rem', borderRadius: 6, textDecoration: 'none', fontSize: '.82rem', fontWeight: 700 }}>
              Open TikTok Ads Manager →
            </a>
          </div>
        </div>
      ) : (
        <div className="sec">
          <h2 className="sh">Campaigns</h2>
          <div className="tw">
            <table>
              <thead><tr><th>Name</th><th>Status</th><th>Objective</th><th className="r">Budget</th><th>Created</th></tr></thead>
              <tbody>
                {data.campaigns.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td><span style={{ background: c.status === 'ENABLE' ? 'var(--grn)' : 'var(--at3)', color: '#000', padding: '1px 7px', borderRadius: 3, fontSize: '.7rem' }}>{c.status}</span></td>
                    <td style={{ fontSize: '.75rem' }}>{c.objective}</td>
                    <td className="r">{mx(c.budget)}</td>
                    <td style={{ fontSize: '.72rem', color: 'var(--at3)' }}>{c.create_time?.slice(0, 10) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function NewCampaignTab() {
  const [presets, setPresets] = useState([]);
  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState('');
  const [budget, setBudget] = useState(20);
  const [objective, setObjective] = useState('OUTCOME_ENGAGEMENT');
  const [optGoal, setOptGoal] = useState('MESSAGING_PURCHASE_CONVERSION');
  const [ageMin, setAgeMin] = useState(25);
  const [ageMax, setAgeMax] = useState(65);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.getCampaignPresets().then(setPresets).catch(() => setPresets([])); }, []);

  // When archetype changes, suggest its budget
  useEffect(() => {
    const p = presets.find(x => x.key === archetype);
    if (p?.suggested_daily_usd) setBudget(p.suggested_daily_usd);
  }, [archetype, presets]);

  const run = async (dry) => {
    setErr(''); setBusy(true); setResult(null); if (dry) setPreview(null);
    try {
      const r = await api.createCampaign({
        name: name.trim(), archetype, daily_budget_usd: budget,
        objective, optimization_goal: optGoal,
        age_min: ageMin, age_max: ageMax, dry_run: !!dry
      });
      if (dry) setPreview(r); else setResult(r);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const monthlyEstimate = budget * 30;
  const selected = presets.find(p => p.key === archetype);

  return (
    <div className="sec">
      <h2 className="sh">🚀 New Campaign Wizard</h2>
      <p style={{ fontSize: '.78rem', color: 'var(--at2)', marginBottom: '1rem' }}>
        Provisions a fresh PAUSED campaign + ad set in Meta via Graph API. WhatsApp destination + Sahiba page baked in.
        <b style={{ color: 'var(--gold)' }}> Nothing goes live</b> — you review in Meta Ads Manager and unpause when ready.
        Attach ads via the Promote IG tab (after this) or Meta Ads Manager directly.
      </p>

      {/* 1. Name */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>1 · Campaign name (short, no spaces — date auto-appended)</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. MIXCALCO  or  BEACH-CITIES  or  VESTIDO517-TEST"
          style={{ width: '100%', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.55rem', borderRadius: 6, fontSize: '.85rem', marginTop: '.3rem', fontFamily: 'monospace' }} />
        <p style={{ fontSize: '.7rem', color: 'var(--at3)', margin: '.2rem 0 0' }}>Becomes: <code>{(name || 'YOUR_NAME').toUpperCase().replace(/[^A-Z0-9_-]/g, '')}-{new Date().toISOString().slice(2, 10).replace(/-/g, '')}</code></p>
      </div>

      {/* 2. Archetype */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>2 · Audience archetype (geo preset)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.4rem' }}>
          {presets.map(p => (
            <button key={p.key} onClick={() => setArchetype(p.key)}
              style={{ background: archetype === p.key ? 'var(--grn)' : 'var(--as2)', color: archetype === p.key ? '#000' : 'var(--at)', border: '1px solid var(--abdr)', padding: '.6rem .8rem', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', textAlign: 'left', fontWeight: archetype === p.key ? 700 : 400 }}>
              <div>{archetype === p.key ? '✓ ' : '+ '}{p.label}</div>
              <div style={{ fontSize: '.7rem', color: archetype === p.key ? '#222' : 'var(--at3)', marginTop: '.2rem' }}>
                {p.summary} · suggested ${p.suggested_daily_usd}/day · {p.note}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Budget + Age */}
      <div style={{ display: 'flex', gap: '.8rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>3 · Daily budget (USD)</label>
          <input type="number" value={budget} onChange={e => setBudget(parseFloat(e.target.value) || 0)} min="1" step="1"
            style={{ width: '100%', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.55rem', borderRadius: 6, fontSize: '.85rem', marginTop: '.3rem' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>Age min</label>
          <input type="number" value={ageMin} onChange={e => setAgeMin(parseInt(e.target.value) || 18)} min="18" max="65"
            style={{ width: '100%', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.55rem', borderRadius: 6, fontSize: '.85rem', marginTop: '.3rem' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>Age max</label>
          <input type="number" value={ageMax} onChange={e => setAgeMax(parseInt(e.target.value) || 65)} min="18" max="65"
            style={{ width: '100%', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.55rem', borderRadius: 6, fontSize: '.85rem', marginTop: '.3rem' }} />
        </div>
        <div style={{ flex: 2, fontSize: '.85rem', color: 'var(--at)' }}>
          <div style={{ color: 'var(--at2)', fontSize: '.7rem', textTransform: 'uppercase' }}>Monthly est.</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)' }}>${monthlyEstimate.toLocaleString('en-US')}</div>
        </div>
      </div>

      {/* 4. Advanced (objective + optim) */}
      <div style={{ display: 'flex', gap: '.8rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>4 · Objective</label>
          <select value={objective} onChange={e => setObjective(e.target.value)}
            style={{ width: '100%', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.55rem', borderRadius: 6, fontSize: '.85rem', marginTop: '.3rem' }}>
            <option value="OUTCOME_ENGAGEMENT">Engagement (default — matches existing Sahiba ads)</option>
            <option value="OUTCOME_SALES">Sales (conversion-optimized)</option>
            <option value="OUTCOME_AWARENESS">Awareness (broadest reach)</option>
            <option value="OUTCOME_TRAFFIC">Traffic (link clicks)</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>Optimization goal</label>
          <select value={optGoal} onChange={e => setOptGoal(e.target.value)}
            style={{ width: '100%', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.55rem', borderRadius: 6, fontSize: '.85rem', marginTop: '.3rem' }}>
            <option value="CONVERSATIONS">Conversations (WhatsApp chats)</option>
            <option value="MESSAGING_PURCHASE_CONVERSION">Messaging Purchase Conversion (Sahiba's current default)</option>
            <option value="REACH">Reach</option>
            <option value="IMPRESSIONS">Impressions</option>
            <option value="LINK_CLICKS">Link clicks</option>
          </select>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '.6rem' }}>
        <button onClick={() => run(true)} disabled={busy || !name || !archetype} className="go" style={{ background: 'var(--blu)' }}>
          {busy ? 'Working…' : '🧪 Dry-run preview'}
        </button>
        <button onClick={() => run(false)} disabled={busy || !name || !archetype} className="go">
          {busy ? 'Creating…' : '✅ Create PAUSED on Meta'}
        </button>
      </div>

      {err && <div className="err" style={{ marginTop: '1rem' }}>{err}</div>}

      {preview && (
        <div style={{ marginTop: '1.5rem', background: 'var(--as2)', padding: '1rem', borderRadius: 6, border: '1px dashed var(--blu)' }}>
          <b style={{ color: 'var(--blu)' }}>🧪 Dry-run preview — nothing actually created</b>
          <pre style={{ fontSize: '.72rem', color: 'var(--at)', marginTop: '.5rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      )}

      {result && (
        <div style={{ marginTop: '1.5rem', background: 'var(--as2)', padding: '1rem', borderRadius: 6, border: `1px solid ${result.ok ? 'var(--grn)' : 'var(--red)'}` }}>
          <b style={{ color: result.ok ? 'var(--grn)' : 'var(--red)' }}>{result.ok ? '✅ Created on Meta (PAUSED)' : '❌ Failed'}</b>
          {result.ok && (<>
            <p style={{ fontSize: '.78rem', color: 'var(--at2)', margin: '.4rem 0' }}>
              Campaign: <code>{result.campaign.id}</code> "{result.campaign.name}"<br/>
              Ad Set: <code>{result.adset.id}</code> "{result.adset.name}"<br/>
              ${result.adset.daily_budget_usd}/day, {result.adset.optimization_goal}, dest={result.adset.destination_type}
            </p>
            <p style={{ fontSize: '.75rem', color: 'var(--gold)', marginTop: '.6rem' }}>⚠️ {result.note}</p>
          </>)}
          {!result.ok && <pre style={{ fontSize: '.72rem' }}>{JSON.stringify(result, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}

function PromoteIgTab() {
  const SUGGESTED_CITIES = ['Cozumel', 'Tuxtla Gutiérrez', 'Colima', 'Puebla', 'Chihuahua', 'Tepic'];
  const [mode, setMode] = useState('add_to_existing');     // 'add_to_existing' (normal) | 'test' (discovery)
  const [igPost, setIgPost] = useState('');
  const [cities, setCities] = useState(new Set(['Cozumel', 'Tuxtla Gutiérrez', 'Colima']));
  const [newCity, setNewCity] = useState('');
  const [selectedAdsets, setSelectedAdsets] = useState(new Set());
  const [adsetList, setAdsetList] = useState([]);
  const [budget, setBudget] = useState(5);
  const [days, setDays] = useState(14);
  const [campaignId, setCampaignId] = useState('NEW_TEST');
  const [campaigns, setCampaigns] = useState([]);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [igUserId, setIgUserId] = useState('');
  const [savedIgUserId, setSavedIgUserId] = useState('');
  const [savingIg, setSavingIg] = useState(false);

  const [health, setHealth] = useState(null);   // for budget-pressure overlay on ad-set chips
  useEffect(() => {
    api.getMetaCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
    api.getLiveAdsets().then(setAdsetList).catch(() => setAdsetList([]));
    api.getSettings().then(s => { setSavedIgUserId(s.ig_user_id || ''); setIgUserId(s.ig_user_id || ''); }).catch(() => {});
    api.getDailyHealth().then(setHealth).catch(() => {});   // slower; chips render without it first, then upgrade
  }, []);
  const toggleAdset = id => setSelectedAdsets(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Spend pressure per ad-set (from Daily Health). Returns { util, label, color } or null.
  const pressure = id => {
    if (!health?.all) return null;
    const h = health.all.find(x => x.id === id); if (!h || !h.dailyBudget) return null;
    const avg = h.avg7d || h.spend24h || 0;
    const util = h.dailyBudget > 0 ? Math.round(100 * avg / h.dailyBudget) : 0;
    // Color rule: >=85% red (constrained), 30-84 green (healthy), <30 gray (under-delivering)
    const color = util >= 85 ? 'var(--red)' : util >= 30 ? 'var(--grn)' : 'var(--at3)';
    return { util, color, label: `$${avg.toFixed(0)}/$${h.dailyBudget.toFixed(0)} (${util}%)` };
  };

  const saveIgUserId = async () => {
    setSavingIg(true);
    try { await api.saveSettings({ ig_user_id: igUserId.trim() }); setSavedIgUserId(igUserId.trim()); setErr(''); }
    catch (e) { setErr(e.message); }
    setSavingIg(false);
  };

  const toggleCity = c => setCities(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  // Comma-or-newline separated input — pastes whole lists in one go
  const addCity = () => {
    const parts = newCity.split(/[,\n]+/).map(p => p.trim()).filter(Boolean);
    if (parts.length) { setCities(s => new Set([...s, ...parts])); setNewCity(''); }
  };

  const run = async (dry) => {
    setErr(''); setBusy(true); setResult(null); if (dry) setPreview(null);
    try {
      const payload = { ig_post: igPost.trim(), dry_run: !!dry, mode };
      if (mode === 'add_to_existing') {
        payload.existing_adset_ids = [...selectedAdsets];
      } else {
        payload.cities = [...cities];
        payload.daily_budget_usd = budget; payload.days = days; payload.campaign_id = campaignId;
      }
      const r = await api.promoteIgPost(payload);
      if (dry) setPreview(r); else setResult(r);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const totalLifetime = budget * days * cities.size;
  const canSubmit = igPost && (mode === 'add_to_existing' ? selectedAdsets.size > 0 : cities.size > 0);

  return (
    <div className="sec">
      <h2 className="sh">Promote Instagram Post → New Ad Set per City</h2>
      <p style={{ fontSize: '.78rem', color: 'var(--at2)', marginBottom: '1rem' }}>
        Your workflow: post on Instagram first, then promote that exact post on Facebook. Paste the IG post URL or shortcode, pick cities, the wizard creates one PAUSED ad set per city.
        <b style={{ color: 'var(--gold)' }}> Nothing goes live</b> — every ad set is created PAUSED for your review in Meta Ads Manager.
      </p>

      {/* One-time setup: IG Business Account ID */}
      <div className="snap-info" style={{ marginBottom: '1rem', borderLeftColor: savedIgUserId ? 'var(--grn)' : 'var(--gold)' }}>
        <b style={{ color: savedIgUserId ? 'var(--grn)' : 'var(--gold)' }}>
          {savedIgUserId ? '✅ IG Business Account ID configured' : '⚠️ One-time setup required: Instagram Business Account ID'}
        </b>
        <p style={{ margin: '.4rem 0', fontSize: '.78rem' }}>
          {savedIgUserId
            ? `Currently saved: ${savedIgUserId}. Change below if needed.`
            : 'Pipeboard needs your IG Business Account ID to resolve IG post URLs. Find it at business.facebook.com → Settings → Instagram accounts → click the Sahiba account → copy the numeric ID (looks like 17841400000000000).'}
        </p>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <input value={igUserId} onChange={e => setIgUserId(e.target.value)} placeholder="17841400000000000"
            style={{ flex: 1, background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.45rem .6rem', borderRadius: 5, fontSize: '.82rem', fontFamily: 'monospace' }} />
          <button onClick={saveIgUserId} disabled={savingIg || !igUserId.trim() || igUserId.trim() === savedIgUserId} className="go" style={{ background: 'var(--grn)' }}>
            {savingIg ? 'Saving...' : (igUserId.trim() === savedIgUserId ? '✓ Saved' : 'Save')}
          </button>
        </div>
      </div>

      {/* IG post input */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>1 · Instagram post</label>
        <input value={igPost} onChange={e => setIgPost(e.target.value)}
          placeholder="https://www.instagram.com/p/Cabc123/  or  shortcode  or  numeric media ID"
          style={{ width: '100%', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.55rem', borderRadius: 6, fontSize: '.85rem', marginTop: '.3rem' }} />
      </div>

      {/* Mode toggle */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>2 · Mode</label>
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.4rem' }}>
          <button onClick={() => setMode('add_to_existing')}
            style={{ flex: 1, background: mode === 'add_to_existing' ? 'var(--grn)' : 'var(--as2)', color: mode === 'add_to_existing' ? '#000' : 'var(--at)', border: '1px solid var(--abdr)', padding: '.6rem .8rem', borderRadius: 6, fontSize: '.85rem', cursor: 'pointer', fontWeight: mode === 'add_to_existing' ? 700 : 400, textAlign: 'left' }}>
            🎯 <b>Promote to existing audience</b> — pick proven ad sets (BEACH, MIXCALCO), add this IG post as a fresh ad. No new ad sets, no budget change.
          </button>
          <button onClick={() => setMode('test')}
            style={{ flex: 1, background: mode === 'test' ? 'var(--blu)' : 'var(--as2)', color: mode === 'test' ? '#000' : 'var(--at)', border: '1px solid var(--abdr)', padding: '.6rem .8rem', borderRadius: 6, fontSize: '.85rem', cursor: 'pointer', fontWeight: mode === 'test' ? 700 : 400, textAlign: 'left' }}>
            🧪 <b>Test a new geo</b> — create 1 new PAUSED ad set per city. For discovery (Cozumel, Tuxtla, etc).
          </button>
        </div>
      </div>

      {/* Mode A: add_to_existing — multi-select ad sets */}
      {mode === 'add_to_existing' && (
        <div style={{ marginBottom: '1rem' }}>
          <div className="snap-info" style={{ marginBottom: '.75rem', borderLeftColor: 'var(--gold)' }}>
            <b style={{ color: 'var(--gold)' }}>⚠️ Known limitation — WhatsApp-funnel ad sets</b>
            <p style={{ margin: '.4rem 0 0', fontSize: '.78rem' }}>
              All Sahiba ad sets currently route to WhatsApp (<code>destination_type: WHATSAPP</code>). Pipeboard's API has a 6-parameter cap that prevents wiring up the WhatsApp CTA + wa.me link during creation, so Meta rejects the ad at publish with <i>"Invalid Creative For Objective"</i>.
              <br/><br/>
              <b>Workaround until the direct Meta Graph API path is built (task #17):</b> open Meta Ads Manager → find a working ad in the target ad set → right-click → <b>Duplicate</b> → click <b>Change post</b> → paste your IG reel URL → Publish. The WhatsApp wiring carries over automatically. 5 minutes per ad.
            </p>
          </div>
          <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>3 · Pick the ad set(s) to add this IG post to ({selectedAdsets.size} selected)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.4rem' }}>
            {adsetList.length === 0 && <span style={{ color: 'var(--at3)', fontSize: '.78rem' }}>Loading ad sets…</span>}
            {adsetList.filter(a => a.status === 'ACTIVE').map(a => {
              const p = pressure(a.id);
              const isSel = selectedAdsets.has(a.id);
              return (
                <button key={a.id} onClick={() => toggleAdset(a.id)} title={p ? `Budget pressure: ${p.label}` : ''}
                  style={{ background: isSel ? 'var(--grn)' : 'var(--as2)', color: isSel ? '#000' : 'var(--at)', border: '1px solid var(--abdr)', borderLeft: p ? `4px solid ${p.color}` : '1px solid var(--abdr)', padding: '.4rem .7rem', borderRadius: 6, fontSize: '.74rem', cursor: 'pointer', fontWeight: isSel ? 700 : 400, textAlign: 'left', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
                  <span>{isSel ? '✓ ' : '+ '}{a.name}</span>
                  {p && <span style={{ fontSize: '.65rem', color: isSel ? '#222' : p.color, fontWeight: 700 }}>{p.label}</span>}
                </button>
              );
            })}
          </div>
          {selectedAdsets.size > 0 && (
            <p style={{ fontSize: '.72rem', color: 'var(--at2)', marginTop: '.5rem' }}>
              Will create 1 shared creative + {selectedAdsets.size} new ad(s), one per selected ad set. All PAUSED. Targeting + budget on each ad set is unchanged.
            </p>
          )}
        </div>
      )}

      {/* Mode B: test — cities + budget + campaign */}
      {mode === 'test' && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>3 · Cities to test ({cities.size} selected)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.4rem' }}>
              {[...new Set([...SUGGESTED_CITIES, ...cities])].map(c => (
                <button key={c} onClick={() => toggleCity(c)}
                  style={{ background: cities.has(c) ? 'var(--grn)' : 'var(--as2)', color: cities.has(c) ? '#000' : 'var(--at)', border: '1px solid var(--abdr)', padding: '.3rem .7rem', borderRadius: 14, fontSize: '.78rem', cursor: 'pointer', fontWeight: cities.has(c) ? 700 : 400 }}>{cities.has(c) ? '✓ ' : '+ '}{c}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem' }}>
              <input value={newCity} onChange={e => setNewCity(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCity()}
                placeholder="+ add cities — paste comma-separated: e.g. Tepic, Culiacán, Hermosillo"
                style={{ flex: 1, background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.4rem .7rem', borderRadius: 6, fontSize: '.78rem' }} />
              <button onClick={addCity} disabled={!newCity.trim()} className="go" style={{ background: 'var(--blu)' }}>Add all</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>4 · Daily budget per city (USD)</label>
              <input type="number" value={budget} onChange={e => setBudget(parseFloat(e.target.value) || 0)} min="1" step="1"
                style={{ width: '100%', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.55rem', borderRadius: 6, fontSize: '.85rem', marginTop: '.3rem' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>Duration (days)</label>
              <input type="number" value={days} onChange={e => setDays(parseInt(e.target.value) || 0)} min="3" step="1"
                style={{ width: '100%', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.55rem', borderRadius: 6, fontSize: '.85rem', marginTop: '.3rem' }} />
            </div>
            <div style={{ flex: 2, fontSize: '.85rem', color: 'var(--at)' }}>
              <div style={{ color: 'var(--at2)', fontSize: '.7rem', textTransform: 'uppercase' }}>Total commitment</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--gold)' }}>${budget * days} × {cities.size} cities = ${totalLifetime}</div>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '.75rem', color: 'var(--at2)', textTransform: 'uppercase' }}>5 · Campaign</label>
            <select value={campaignId} onChange={e => setCampaignId(e.target.value)}
              style={{ width: '100%', background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.55rem', borderRadius: 6, fontSize: '.85rem', marginTop: '.3rem' }}>
              <option value="NEW_TEST">🆕 Create new TEST campaign (auto-named)</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.status === 'ACTIVE' ? '🟢 ' : '⏸️ '}{c.name}</option>)}
            </select>
          </div>
        </>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '.6rem' }}>
        <button onClick={() => run(true)} disabled={busy || !canSubmit} className="go" style={{ background: 'var(--blu)' }}>
          {busy ? 'Working…' : '🧪 Dry-run preview'}
        </button>
        <button onClick={() => run(false)} disabled={busy || !canSubmit} className="go">
          {busy ? 'Creating…' : '✅ Create PAUSED on Meta'}
        </button>
      </div>

      {err && <div className="err" style={{ marginTop: '1rem' }}>{err}</div>}

      {/* Preview output */}
      {preview && (
        <div style={{ marginTop: '1.5rem', background: 'var(--as2)', padding: '1rem', borderRadius: 6, border: '1px dashed var(--blu)' }}>
          <b style={{ color: 'var(--blu)' }}>🧪 Dry-run preview — nothing actually created</b>
          <pre style={{ fontSize: '.72rem', color: 'var(--at)', marginTop: '.5rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      )}

      {/* Real result */}
      {result && (
        <div style={{ marginTop: '1.5rem', background: 'var(--as2)', padding: '1rem', borderRadius: 6, border: `1px solid ${result.ok ? 'var(--grn)' : 'var(--red)'}` }}>
          <b style={{ color: result.ok ? 'var(--grn)' : 'var(--red)' }}>
            {result.ok ? '✅ Created on Meta (PAUSED)' : (result.error ? '❌ ' + result.error : '⚠️ Partial — see rows below')}
          </b>
          {result.results && (<>
            <p style={{ fontSize: '.78rem', color: 'var(--at2)', margin: '.4rem 0' }}>
              {result.mode === 'add_to_existing'
                ? <>IG media: <code>{result.ig_media_id}</code> · Shared creative: <code>{result.creative_id || '—'}</code></>
                : <>Campaign: <code>{result.campaign_id}</code> · IG media: <code>{result.ig_media_id}</code> · Each ad set: ${result.lifetime_budget_usd_each} lifetime, ends {result.end_time?.slice(0, 10)}</>
              }
            </p>
            {result.mode === 'add_to_existing' ? (
              <table style={{ width: '100%', marginTop: '.5rem', fontSize: '.78rem' }}>
                <thead><tr><th align="left">Ad Set</th><th align="left">Ad Set ID</th><th align="left">New Ad Name</th><th align="left">Ad ID</th><th align="left">Status</th></tr></thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i}>
                      <td>{r.adset_name || '—'}</td>
                      <td><code style={{ fontSize: '.7rem' }}>{r.adset_id}</code></td>
                      <td>{r.ad_name || r.would_create_ad || '—'}</td>
                      <td><code style={{ fontSize: '.7rem' }}>{r.ad_id || '—'}</code></td>
                      <td style={{ color: r.error ? 'var(--red)' : 'var(--grn)' }}>{r.error || (r.dry_run ? '(dry-run)' : 'PAUSED')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table style={{ width: '100%', marginTop: '.5rem', fontSize: '.78rem' }}>
                <thead><tr><th align="left">City</th><th align="left">Ad Set</th><th align="left">Ad Set ID</th><th align="left">Status</th></tr></thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i}>
                      <td>{r.city}</td>
                      <td>{r.name || '—'}</td>
                      <td><code style={{ fontSize: '.7rem' }}>{r.adset_id || '—'}</code></td>
                      <td style={{ color: r.error ? 'var(--red)' : 'var(--grn)' }}>{r.error || (r.dry_run ? '(dry-run)' : 'PAUSED')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ fontSize: '.75rem', color: result.ok ? 'var(--gold)' : 'var(--red)', marginTop: '.6rem' }}>{result.ok ? '⚠️ ' : '❌ '}{result.note}</p>
          </>)}
          {!result.results && <pre style={{ fontSize: '.72rem' }}>{JSON.stringify(result, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}

function DailyHealthTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.getDailyHealth().then(setData).catch(e => setData({ ok: false, error: e.message })).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const doAction = async (adsetId, name, action, params = {}, confirmMsg) => {
    if (!window.confirm(`${confirmMsg}\n\nAd set: ${name}\n\nThis WILL change your live Meta ad set. Proceed?`)) return;
    setBusy(adsetId + '::' + action);
    try {
      const r = await api.adsetAction({ adset_id: adsetId, action, ...params });
      if (r.ok) { alert(`✅ ${action} applied to ${name}`); load(); }
      else alert(`❌ Failed: ${JSON.stringify(r).slice(0, 240)}`);
    } catch (e) { alert(`❌ ${e.message}`); }
    setBusy('');
  };

  if (loading) return <div className="ld"><div className="sp"></div><p>Running daily health check (pulls 24h + 7d spend on each ACTIVE ad set — ~30s)…</p></div>;
  if (!data || !data.ok) return <div className="sec"><h2 className="sh">Daily Health</h2><div className="err">Error: {data?.error || 'no data'}</div></div>;

  const $u = (v, dec = 2) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const tierBg = { STUCK: 'var(--red)', DROPPING: 'var(--org)', EXPIRING: 'var(--gold)', IDLE: 'var(--at3)' };

  return (
    <>
      <div className="sec">
        <h2 className="sh">Daily Health Check — {data.date}</h2>
        <p style={{ fontSize: '.78rem', color: 'var(--at2)', marginBottom: '.75rem' }}>
          Read-only snapshot. No auto-changes. Flags ad sets that need your attention. Snapshot also saved to <code style={{ background: 'var(--as2)', padding: '1px 5px', borderRadius: 3 }}>{data.reportPath}</code>.
        </p>
        <div className="kr">
          <div className="k"><div className="l">Yesterday spend</div><div className="v">{$u(data.totalSpend24h)}</div><div className="s">across {data.activeCount} ACTIVE ad sets</div></div>
          <div className="k"><div className="l">7-day spend</div><div className="v">{$u(data.totalSpend7d)}</div><div className="s">avg {$u(data.avgDaily7d)}/day</div></div>
          <div className="k"><div className="l">Alerts</div><div className="v" style={{ color: data.alertCount ? 'var(--red)' : 'var(--grn)' }}>{data.alertCount}</div><div className="s">{data.alertCount ? 'see below' : '✓ all healthy'}</div></div>
          <div className="k"><div className="l">Projected month-end</div><div className="v">{$u(data.avgDaily7d * 30, 0)}</div><div className="s">at current pace</div></div>
        </div>
      </div>

      {data.alerts.length > 0 && (
        <div className="sec">
          <h2 className="sh">⚠️ Alerts — needs your attention</h2>
          <p style={{ fontSize: '.72rem', color: 'var(--at3)', marginBottom: '.5rem' }}>Click an action button to resolve immediately. Every action confirms before touching Meta.</p>
          {data.alerts.map(a => {
            // Build action set based on tier mix
            const tiers = new Set(a.flags.map(f => f.tier));
            const actions = [];
            if (tiers.has('EXPIRING')) {
              actions.push({ label: '⏰ Extend +14d, top up $350', action: 'extend', params: { add_usd: 350, days: 14 }, confirm: `Extend lifetime budget by $350 and push end date 14 days out.` });
              actions.push({ label: '⏰ Extend +30d, top up $750', action: 'extend', params: { add_usd: 750, days: 30 }, confirm: `Extend lifetime budget by $750 and push end date 30 days out.` });
            }
            if (tiers.has('STUCK') || tiers.has('IDLE')) {
              actions.push({ label: '💸 Drop daily to $5', action: 'set_daily', params: { set_daily_usd: 5 }, confirm: `Lower daily budget to $5 to test if Meta will deliver smaller. Often unsticks delivery without losing the ad set.` });
            }
            actions.push({ label: '🛑 Pause this ad set', action: 'pause', confirm: `Pause this ad set entirely. Frees its budget. You can resume later from Ads Manager.` });

            return (
              <div key={a.id} style={{ background: 'var(--as)', padding: '.75rem 1rem', borderRadius: 6, marginBottom: '.5rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '.3rem' }}>{a.name}</div>
                {a.flags.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: '.25rem 0', fontSize: '.85rem' }}>
                    <span style={{ background: tierBg[f.tier], color: '#000', padding: '1px 7px', borderRadius: 3, fontSize: '.7rem', fontWeight: 700, minWidth: 70, textAlign: 'center' }}>{f.tier}</span>
                    <span style={{ color: 'var(--at)' }}>{f.msg}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', marginTop: '.6rem', paddingTop: '.5rem', borderTop: '1px solid var(--abdr)' }}>
                  {actions.map((act, j) => {
                    const isBusy = busy === a.id + '::' + act.action;
                    return (
                      <button key={j} disabled={!!busy} onClick={() => doAction(a.id, a.name, act.action, act.params, act.confirm)}
                        style={{ background: act.action === 'pause' ? 'var(--red)' : act.action === 'extend' ? 'var(--gold)' : 'var(--blu)', color: act.action === 'pause' ? '#fff' : '#000', border: 'none', padding: '.4rem .8rem', borderRadius: 5, fontSize: '.78rem', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy && !isBusy ? .4 : 1 }}>
                        {isBusy ? '...' : act.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sec">
        <h2 className="sh">All ACTIVE ad sets</h2>
        <div className="tw">
          <table>
            <thead><tr><th>Ad Set</th><th className="r">Daily $</th><th className="r">Lifetime $</th><th>End</th><th className="r">24h Spend</th><th className="r">7d Spend</th><th>Status</th></tr></thead>
            <tbody>
              {data.all.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="r">{c.dailyBudget ? '$' + c.dailyBudget.toFixed(0) : '—'}</td>
                  <td className="r">{c.lifetimeBudget ? '$' + c.lifetimeBudget.toFixed(0) : '—'}</td>
                  <td style={{ fontSize: '.75rem', color: 'var(--at3)' }}>{c.endTime ? c.endTime.slice(0, 10) : '—'}</td>
                  <td className="r">{$u(c.spend24h)}</td>
                  <td className="r">{$u(c.spend7d)}</td>
                  <td>{c.flags.length ? c.flags.map(f => <span key={f.tier} style={{ background: tierBg[f.tier], color: '#000', padding: '1px 6px', borderRadius: 3, fontSize: '.65rem', fontWeight: 700, marginRight: 3 }}>{f.tier}</span>) : <span style={{ color: 'var(--grn)' }}>OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function GeoROITab() {
  const [data, setData] = useState(null);
  const [sql, setSql] = useState(null);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);

  const load = useCallback((d) => {
    setLoading(true); setSql(null);
    api.getGeoROI(d).then(setData).catch(e => setData({ ok: false, error: e.message })).finally(() => setLoading(false));
    api.getSqlROI(d).then(setSql).catch(e => setSql({ ok: false, error: e.message }));   // slower, runs in parallel; CDMX block shows when ready
  }, []);
  useEffect(() => { load(days); }, [load, days]);

  if (loading) return <div className="ld"><div className="sp"></div><p>Loading geo ROI…</p></div>;
  if (!data || !data.ok) return <div className="sec"><h2 className="sh">Geo ROI</h2><div className="err">Error: {data?.error || 'no data'}</div></div>;

  const r = data.rate;
  const $u = (v, dec = 0) => '$' + (v || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const mx = v => '$' + Math.round(v || 0).toLocaleString('en-US') + ' MXN';
  const fmt = n => (n || 0).toLocaleString('en-US');

  const tierColor = { SCALE: 'var(--grn)', KEEP: 'var(--blu)', CUT: 'var(--red)', TEST: 'var(--at3)', REVIEW: 'var(--gold)' };
  const states = data.states.filter(s => s.leads >= 10);
  const scale = states.filter(s => s.tier === 'SCALE');
  const keep  = states.filter(s => s.tier === 'KEEP');
  const cut   = states.filter(s => s.tier === 'CUT');
  const totalScaleUSD = scale.reduce((a, b) => a + b.revUSD, 0);
  const totalKeepUSD  = keep.reduce((a, b) => a + b.revUSD, 0);
  const totalCutUSD   = cut.reduce((a, b) => a + b.revUSD, 0);
  const totalCutLeads = cut.reduce((a, b) => a + b.leads, 0);

  return (
    <>
      <div className="sec">
        <h2 className="sh">Geo ROI — Revenue by Mexican State</h2>
        <p style={{ fontSize: '.8rem', color: 'var(--at2)', marginBottom: '.75rem' }}>
          State is decoded from each contact's phone LADA (area code); revenue comes from SQL Server POS, joined on last 10 digits of phone.
          Window: last {data.days} days (since {data.since}). Rate: 1 USD = {r} MXN.
        </p>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginBottom: '1rem' }}>
          <label style={{ fontSize: '.75rem', color: 'var(--at2)' }}>Window:</label>
          {[30, 60, 90, 120].map(d => (
            <button key={d} className={`tab ${days === d ? 'active' : ''}`} onClick={() => setDays(d)} style={{ padding: '.3rem .75rem', fontSize: '.75rem' }}>{d}d</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '.72rem', color: 'var(--at3)' }}>
            {fmt(data.contactStats.withState)} contacts mapped to state · {data.lineStats.matchedLines}/{data.lineStats.totalLines} POS lines matched ({data.lineStats.matchPct.toFixed(1)}%)
          </span>
        </div>

        <div className="snap-info" style={{ marginBottom: '1rem', borderLeftColor: 'var(--grn)' }}>
          <b style={{ color: 'var(--grn)' }}>🏙️ CDMX — the highest-ROAS geo in the account (don't read the table row for CDMX)</b>
          <p style={{ margin: '.4rem 0 .75rem', fontSize: '.78rem' }}>
            CDMX is critical, not a candidate for cuts. Both stores (Leona Vicario, Circunvalación) are in CDMX, so most CDMX customers <b>walk in</b> without leaving a phone — they never appear in the LADA/phone-match table below. Real attribution is via store walk-in revenue ÷ Mixcalco ad spend.
          </p>
          {sql && sql.ok && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.6rem', marginTop: '.5rem' }}>
              <div style={{ background: 'var(--as2)', padding: '.5rem .65rem', borderRadius: 6 }}>
                <div style={{ fontSize: '.65rem', color: 'var(--at2)', textTransform: 'uppercase' }}>CDMX walk-in revenue</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--grn)' }}>{$u(sql.totals.cdmxAdWalkinRevUSD || 0)}</div>
                <div style={{ fontSize: '.68rem', color: 'var(--at3)' }}>{(Math.round(sql.totals.cdmxAdWalkinRevMXN || 0)).toLocaleString('en-US')} MXN · {sql.days}d</div>
              </div>
              <div style={{ background: 'var(--as2)', padding: '.5rem .65rem', borderRadius: 6 }}>
                <div style={{ fontSize: '.65rem', color: 'var(--at2)', textTransform: 'uppercase' }}>Mixcalco ad spend</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--at)' }}>{$u(sql.totals.mixcalcoSpendUSD || 0)}</div>
                <div style={{ fontSize: '.68rem', color: 'var(--at3)' }}>4 ad sets · 40–50mi CDMX radius</div>
              </div>
              <div style={{ background: 'var(--as2)', padding: '.5rem .65rem', borderRadius: 6 }}>
                <div style={{ fontSize: '.65rem', color: 'var(--at2)', textTransform: 'uppercase' }}>Mixcalco ROAS</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--gold)' }}>{sql.totals.mixcalcoROAS ? sql.totals.mixcalcoROAS.toFixed(1) + '×' : '—'}</div>
                <div style={{ fontSize: '.68rem', color: 'var(--at3)' }}>highest-ROAS geo in the account</div>
              </div>
            </div>
          )}
        </div>

        <div className="kr">
          <div className="k"><div className="l">🟢 SCALE states</div><div className="v" style={{ color: 'var(--grn)' }}>{scale.length}</div><div className="s">{$u(totalScaleUSD)} · {mx(totalScaleUSD * r)}</div></div>
          <div className="k"><div className="l">🔵 KEEP states</div><div className="v" style={{ color: 'var(--blu)' }}>{keep.length}</div><div className="s">{$u(totalKeepUSD)} · {mx(totalKeepUSD * r)}</div></div>
          <div className="k"><div className="l">🔴 CUT states</div><div className="v" style={{ color: 'var(--red)' }}>{cut.length}</div><div className="s">{$u(totalCutUSD)} from {fmt(totalCutLeads)} leads — pause</div></div>
          <div className="k"><div className="l">Total ad-driven (online)</div><div className="v" style={{ color: 'var(--gold)' }}>{$u(totalScaleUSD + totalKeepUSD + totalCutUSD)}</div><div className="s">{mx((totalScaleUSD + totalKeepUSD + totalCutUSD) * r)} · ex-CDMX walk-in</div></div>
        </div>
      </div>

      <div className="sec">
        <h2 className="sh">Per-State Ranking — sorted by USD revenue per lead</h2>
        <div className="tw">
          <table>
            <thead><tr>
              <th>Tier</th><th>State</th>
              <th className="r">Leads</th><th className="r">Tickets</th>
              <th className="r">Revenue (MXN)</th><th className="r">Revenue (USD)</th>
              <th className="r">Avg Ticket (MXN)</th><th className="r">Avg Ticket (USD)</th>
              <th className="r">Conv %</th><th className="r">USD / Lead</th>
            </tr></thead>
            <tbody>
              {states.map(s => (
                <tr key={s.state}>
                  <td><span style={{ background: tierColor[s.tier], color: '#000', padding: '2px 8px', borderRadius: 4, fontSize: '.7rem', fontWeight: 700 }}>{s.tier}</span></td>
                  <td style={{ fontWeight: 600 }}>{s.state}</td>
                  <td className="r">{fmt(s.leads)}</td>
                  <td className="r">{fmt(s.tickets)}</td>
                  <td className="r">{Math.round(s.revMXN).toLocaleString('en-US')}</td>
                  <td className="r best">{$u(s.revUSD)}</td>
                  <td className="r">{Math.round(s.avgTicketMXN).toLocaleString('en-US')}</td>
                  <td className="r">{$u(s.avgTicketUSD)}</td>
                  <td className="r">{s.convPct.toFixed(2)}%</td>
                  <td className={`r ${s.tier === 'SCALE' ? 'best' : s.tier === 'CUT' ? 'worst' : ''}`} style={{ fontWeight: 700 }}>{$u(s.usdPerLead, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '.72rem', color: 'var(--at3)', marginTop: '.75rem' }}>
          Tiers (last 90d): SCALE ≥ $3 USD/lead · KEEP $1–3 · CUT &lt; $1 · TEST &lt; 50 leads · REVIEW = CDMX walk-in undercount.
          Tickets count once per receipt; multi-line tickets aggregate to a single revenue figure.
        </p>
      </div>
    </>
  );
}

function SalesROITab() {
  const [data, setData] = useState(null);
  const [sql, setSql] = useState(null);
  const [loading, setLoading] = useState(true);
  const [leadsUrl, setLeadsUrl] = useState('');
  const [salesUrl, setSalesUrl] = useState('');
  const [rate, setRate] = useState('18');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([api.getSettings(), api.getSalesROI()]);
      setLeadsUrl(s.sheet_leads_url || ''); setSalesUrl(s.sheet_sales_url || ''); setRate(s.mxn_rate || '18');
      setData(d);
    } catch (e) { setData({ error: e.message }); }
    setLoading(false);
    api.getSqlROI(90).then(setSql).catch(e => setSql({ ok: false, error: e.message }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveCfg = async () => {
    setSaving(true);
    await api.saveSettings({ sheet_leads_url: leadsUrl.trim(), sheet_sales_url: salesUrl.trim(), mxn_rate: rate });
    await load();
    setSaving(false);
  };

  if (loading) return <div className="ld"><div className="sp"></div><p>Loading sales & ROI...</p></div>;

  const setup = (
    <div className="snap-info" style={{ marginBottom: '1.5rem' }}>
      <b>Setup — paste your two published CSV links</b>
      <p style={{ margin: '.5rem 0', fontSize: '.78rem' }}>Google Sheet → File → Share → Publish to web → pick the tab → CSV → Publish → paste link.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '.5rem' }}>
        <input value={leadsUrl} onChange={e => setLeadsUrl(e.target.value)} placeholder="Sheet 2 — Leads/attribution CSV URL"
          style={{ background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.5rem', borderRadius: 6, fontSize: '.8rem', fontFamily: 'DM Sans' }} />
        <input value={salesUrl} onChange={e => setSalesUrl(e.target.value)} placeholder="Sheet 1 — Sales log CSV URL"
          style={{ background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.5rem', borderRadius: 6, fontSize: '.8rem', fontFamily: 'DM Sans' }} />
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          <label style={{ fontSize: '.72rem', color: 'var(--at2)' }}>MXN per USD:</label>
          <input value={rate} onChange={e => setRate(e.target.value)} style={{ width: 70, background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.4rem', borderRadius: 6, fontSize: '.8rem' }} />
          <button className="go" onClick={saveCfg} disabled={saving}>{saving ? 'Saving...' : 'Save & Refresh'}</button>
        </div>
      </div>
    </div>
  );

  if (!data || data.configured === false) {
    return <div><div className="sec"><h2 className="sh">Sales &amp; ROI</h2>{setup}<p style={{ color: 'var(--at3)', fontSize: '.85rem' }}>{data?.message || 'Not configured yet.'}</p></div></div>;
  }
  if (data.error) {
    return <div><div className="sec"><h2 className="sh">Sales &amp; ROI</h2>{setup}<div className="err">Error: {data.error}</div></div></div>;
  }

  const t = data.totals;
  const posBlock = () => {
    if (!sql) return <div className="sec"><h2 className="sh">Live POS Revenue (SQL Server)</h2><div className="ld"><div className="sp"></div><p>Pulling live POS sales from SQL Server…</p></div></div>;
    if (!sql.ok) return <div className="sec"><h2 className="sh">Live POS Revenue (SQL Server)</h2><div className="err">SQL error: {sql.error}</div></div>;
    const T = sql.totals;
    return (
      <>
        <div className="sec">
          <h2 className="sh">Live POS Revenue — SQL Server (true numbers)</h2>
          <p style={{ fontSize: '.8rem', color: 'var(--at2)', marginBottom: '1rem' }}>
            Real revenue from the point-of-sale system, last {sql.days} days (since {sql.since}). This is the authoritative source — the Google-sheet section below is the manual log for comparison.
          </p>
          <div className="kr">
            <div className="k"><div className="l">Online Revenue</div><div className="v" style={{ color: 'var(--grn)' }}>{$(T.onlineRevUSD, 0)}</div><div className="s">{fmt(T.onlineRevMXN, 0)} MXN @ {sql.rate} · agent online</div></div>
            <div className="k"><div className="l">In-Store from FB Lead</div><div className="v" style={{ color: 'var(--grn)' }}>{$(T.adWalkinRevUSD || 0, 0)}</div><div className="s">{fmt(T.adWalkinTickets || 0)} tickets · walk-in phone = FB lead</div></div>
            <div className="k"><div className="l">Store-Gift Revenue</div><div className="v" style={{ color: 'var(--grn)' }}>{$(T.giftRevUSD || 0, 0)}</div><div className="s">{fmt(T.giftTickets || 0)} tickets · 126OB/130OB · FB walk-in</div></div>
            <div className="k"><div className="l">CDMX Ad Walk-in (Mixcalco)</div><div className="v" style={{ color: 'var(--grn)' }}>{$(T.cdmxAdWalkinRevUSD || T.walkinRevUSD, 0)}</div><div className="s">{fmt(T.cdmxAdWalkinRevMXN || T.walkinRevMXN, 0)} MXN · Leona+Cercu walk-in · Mixcalco ROAS {T.mixcalcoROAS ? T.mixcalcoROAS.toFixed(1) + '×' : '—'}</div></div>
            <div className="k"><div className="l">Mixcalco Ad Spend</div><div className="v" style={{ color: 'var(--at2)' }}>{$(T.mixcalcoSpendUSD || 0, 0)}</div><div className="s">4 ad sets · 90d · drives the walk-in column</div></div>
            <div className="k"><div className="l">Ad-Driven Total</div><div className="v" style={{ color: 'var(--gold)' }}>{$(T.adDrivenRevUSD || T.onlineRevUSD, 0)}</div><div className="s">online + FB lead + gift + CDMX walk-in</div></div>
            <div className="k"><div className="l">POS Tickets</div><div className="v">{fmt(T.ticketCount + (T.giftTickets || 0))}</div><div className="s">{fmt(T.lineCount)} line items</div></div>
            <div className="k"><div className="l">Total POS Revenue</div><div className="v">{$(T.onlineRevUSD + (T.adWalkinRevUSD || 0) + T.walkinRevUSD + (T.giftRevUSD || 0), 0)}</div><div className="s">online + FB lead + gift + walk-in</div></div>
          </div>
        </div>

        <div className="sec">
          <h2 className="sh">Campaign ROI — TRUE (POS revenue, online attributed)</h2>
          <div className="tw">
            <table>
              <thead><tr>
                <th>Campaign</th><th className="r">Orders</th><th className="r">Customers</th>
                <th className="r">Ad Spend (USD)</th><th className="r">POS Revenue (USD)</th><th className="r">Cost/Order</th><th className="r">ROAS</th>
              </tr></thead>
              <tbody>
                {sql.campaigns.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</td>
                    <td className="r">{fmt(c.orders)}</td>
                    <td className="r">{fmt(c.customers)}</td>
                    <td className="r">{$(c.spendUSD, 0)}</td>
                    <td className="r">{$(c.revenueUSD, 0)}</td>
                    <td className="r">{c.costPerOrder != null ? $(c.costPerOrder) : '—'}</td>
                    <td className={`r ${c.roas >= 1 ? 'best' : c.roas != null ? 'worst' : ''}`}>{c.roas != null ? c.roas.toFixed(2) + '×' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sec">
          <h2 className="sh">Agent Scorecard — POS (online vs walk-in)</h2>
          <div className="tw">
            <table>
              <thead><tr><th>Agent</th><th className="r">Online Orders</th><th className="r">Online Rev (USD)</th><th className="r">FB-Lead Walk-in</th><th className="r">FB-Lead Rev (USD)</th><th className="r">Walk-in Orders</th><th className="r">Walk-in Rev (USD)</th><th className="r">Total Rev (USD)</th></tr></thead>
              <tbody>
                {sql.agents.map(a => (
                  <tr key={a.name}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td className="r">{fmt(a.onlineOrders)}</td>
                    <td className="r best">{$(a.onlineRevUSD, 0)}</td>
                    <td className="r">{fmt(a.adWalkinOrders || 0)}</td>
                    <td className="r best">{$(a.adWalkinRevUSD || 0, 0)}</td>
                    <td className="r">{fmt(a.walkinOrders)}</td>
                    <td className="r">{$(a.walkinRevUSD, 0)}</td>
                    <td className="r" style={{ fontWeight: 700 }}>{$(a.onlineRevUSD + (a.adWalkinRevUSD || 0) + a.walkinRevUSD, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  return (
    <div>
      <div className="sec">
        <h2 className="sh">Sales &amp; ROI</h2>
        {setup}
      </div>
      {posBlock()}
      <div className="sec">
        <h2 className="sh">Manual Sales Log (Google Sheet — for comparison)</h2>
        <p style={{ fontSize: '.78rem', color: 'var(--at3)', marginBottom: '1rem' }}>Hand-entered conversions. The SQL section above is the source of truth; this is kept to spot data-entry gaps.</p>
        <div className="kr">
          <div className="k"><div className="l">Leads (ads)</div><div className="v">{fmt(t.leads)}</div><div className="s">from attribution sheet</div></div>
          <div className="k"><div className="l">Sales</div><div className="v">{fmt(t.sales)}</div><div className="s">{pct(t.matchRate, 0)} matched to an ad</div></div>
          <div className="k"><div className="l">Revenue</div><div className="v">{$(t.revenueUSD, 0)}</div><div className="s">${fmt(t.revenueMXN, 0)} MXN @ {data.rate}</div></div>
          <div className="k"><div className="l">Attributed sales</div><div className="v">{fmt(t.matched)}</div><div className="s">{fmt(t.unmatched)} not matched</div></div>
        </div>
      </div>

      <div className="sec">
        <h2 className="sh">Campaign ROI (ranked by ROAS)</h2>
        <div className="tw">
          <table>
            <thead><tr>
              <th>Campaign</th><th className="r">Leads</th><th className="r">Sales</th><th className="r">Conv %</th>
              <th className="r">Spend (USD)</th><th className="r">Revenue (USD)</th><th className="r">Cost/Sale</th><th className="r">ROAS</th>
            </tr></thead>
            <tbody>
              {data.campaigns.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</td>
                  <td className="r">{fmt(c.leads)}</td>
                  <td className="r">{fmt(c.sales)}</td>
                  <td className="r">{pct(c.convRate, 1)}</td>
                  <td className="r">{$(c.spendUSD, 0)}</td>
                  <td className="r">{$(c.revenueUSD, 0)}</td>
                  <td className="r">{c.costPerSale != null ? $(c.costPerSale) : '—'}</td>
                  <td className={`r ${c.roas >= 1 ? 'best' : c.roas != null ? 'worst' : ''}`}>{c.roas != null ? c.roas.toFixed(2) + '×' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '.72rem', color: 'var(--at3)', marginTop: '.6rem' }}>ROAS = revenue ÷ ad spend. Above 1× = profitable on ad cost (before product cost).</p>
      </div>

      <div className="sec">
        <h2 className="sh">Agent Scorecard</h2>
        <div className="tw">
          <table>
            <thead><tr><th>Agent</th><th className="r">Deals Closed</th><th className="r">Revenue (USD)</th><th className="r">Avg Ticket (USD)</th></tr></thead>
            <tbody>
              {data.agents.map(a => (
                <tr key={a.name}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td className="r">{fmt(a.deals)}</td>
                  <td className="r">{$(a.revenueUSD, 0)}</td>
                  <td className="r">{$(a.avgTicketUSD, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══ SCHEDULE TAB (Phase 2) ═══
function ScheduleTab({ hourRich }) {
  const recOn = (hourRich?.onHours && hourRich.onHours.length) ? hourRich.onHours : Array.from({ length: 24 }, (_, i) => i);
  const [onHours, setOnHours] = useState(new Set(recOn));
  const [days, setDays] = useState(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [adsets, setAdsets] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [budget, setBudget] = useState(700);
  const [endDate, setEndDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const loadAdsets = useCallback(async () => {
    setLoading(true);
    try { setAdsets(await api.getLiveAdsets()); } catch (e) { setAdsets({ error: e.message }); }
    setLoading(false);
  }, []);
  useEffect(() => { loadAdsets(); }, [loadAdsets]);

  const toggleHour = h => setOnHours(p => { const n = new Set(p); n.has(h) ? n.delete(h) : n.add(h); return n; });
  const toggleDay = d => setDays(p => { const n = new Set(p); n.has(d) ? n.delete(d) : n.add(d); return n; });
  const togglePick = id => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const apply = async () => {
    if (!picked.size) return alert('Select at least one ad set');
    if (!onHours.size) return alert('Select at least one ON hour');
    const list = [...picked];
    const offH = Array.from({ length: 24 }, (_, i) => i).filter(h => !onHours.has(h));
    const warn = `Create ${list.length} scheduled DUPLICATE ad set(s)?\n\n` +
      `• ON hours: ${[...onHours].sort((a,b)=>a-b).map(h=>h+':00').join(', ')}\n` +
      `• OFF (paused) hours: ${offH.map(h=>h+':00').join(', ') || 'none'}\n` +
      `• Days: ${[...days].sort().map(d=>DOWS[d]).join(', ')}\n` +
      `• New copy uses LIFETIME budget $${budget} (ends ${endDate})\n\n` +
      `Originals are NOT touched. New copies are created PAUSED for you to review & publish in Meta.\n\n` +
      `Note: a duplicate re-enters Meta's learning phase (~3–7 days) — this is unavoidable for scheduling. Continue?`;
    if (!confirm(warn)) return;
    setLoading(true); setResults(null);
    const out = [];
    for (const id of list) {
      try {
        const r = await api.duplicateWithSchedule({ adset_id: id, on_hours: [...onHours], days: [...days], lifetime_budget: budget, end_time: endDate });
        if (r.ok) out.push({ id, ok: true, msg: `New scheduled copy created (PAUSED): ${r.new_adset?.id} — ${(r.ads||[]).filter(a=>a.id).length} ads cloned` });
        else out.push({ id, ok: false, msg: r.error || JSON.stringify(r).slice(0, 160) });
      } catch (e) { out.push({ id, ok: false, msg: e.message }); }
    }
    setResults(out); setLoading(false);
    loadAdsets();
  };

  return (
    <div>
      <div className="sec">
        <h2 className="sh">Duplicate &amp; Schedule (Dayparting)</h2>
        <p style={{ fontSize: '.8rem', color: 'var(--at2)', marginBottom: '1rem' }}>
          Meta blocks converting an existing daily-budget ad set to scheduling. So this creates a <b>new PAUSED copy</b> with
          a lifetime budget + the dead-hours schedule baked in. Your originals are never touched. Pre-filled with the cheapest hours.
        </p>
        <div className="snap-info" style={{ marginBottom: '1.25rem', borderColor: 'rgba(251,146,60,.4)' }}>
          <b>⚠ Read this:</b> A duplicate is a new ad set, so it <b>re-enters Meta's learning phase (~3–7 days)</b> — unavoidable
          for any scheduled ad. Social proof (likes/comments) carries over via the same post, so it usually settles fast.
          New copies are created <b>PAUSED</b>; you review &amp; publish them in Meta. Originals stay live and unchanged so you lose nothing.
        </div>

        {/* Hour grid */}
        <h4 style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--at2)', marginBottom: '.6rem' }}>Hours to run ads (green = ON)</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px', marginBottom: '1.25rem' }}>
          {Array.from({ length: 24 }, (_, h) => {
            const on = onHours.has(h);
            const tier = hourRich?.rows?.find(r => r.hour === h)?.tier;
            return (
              <button key={h} onClick={() => toggleHour(h)}
                title={tier ? tier.toUpperCase() : ''}
                style={{
                  padding: '.5rem .2rem', borderRadius: 6, fontSize: '.72rem', fontWeight: 600, cursor: 'pointer',
                  border: '1px solid ' + (on ? 'var(--grn)' : 'var(--abdr)'),
                  background: on ? 'rgba(74,222,128,.18)' : 'var(--as2)',
                  color: on ? 'var(--grn)' : 'var(--at3)', fontFamily: 'DM Sans'
                }}>
                {String(h).padStart(2, '0')}
              </button>
            );
          })}
        </div>

        {/* Days */}
        <h4 style={{ fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--at2)', marginBottom: '.6rem' }}>Days</h4>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {DOWS.map((d, i) => {
            const on = days.has(i);
            return (
              <button key={i} onClick={() => toggleDay(i)}
                style={{
                  padding: '.5rem .9rem', borderRadius: 6, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer',
                  border: '1px solid ' + (on ? 'var(--gold)' : 'var(--abdr)'),
                  background: on ? 'rgba(232,176,74,.18)' : 'var(--as2)',
                  color: on ? 'var(--gold)' : 'var(--at3)', fontFamily: 'DM Sans'
                }}>{d}</button>
            );
          })}
        </div>

        {/* Budget + end date */}
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--at2)' }}>Lifetime budget (USD)</label><br />
            <input type="number" value={budget} onChange={e => setBudget(parseInt(e.target.value) || 0)}
              style={{ background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.45rem .6rem', borderRadius: 6, fontFamily: 'DM Sans', fontSize: '.85rem', width: 120, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--at2)' }}>End date</label><br />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ background: 'var(--as2)', border: '1px solid var(--abdr)', color: 'var(--at)', padding: '.45rem .6rem', borderRadius: 6, fontFamily: 'DM Sans', fontSize: '.85rem', marginTop: 4 }} />
          </div>
        </div>
      </div>

      {/* Ad set picker */}
      <div className="sec">
        <h2 className="sh">Pick Ad Sets To Schedule</h2>
        {loading && !adsets && <div className="ld"><div className="sp"></div><p>Loading ad sets...</p></div>}
        {adsets?.error && <div className="err">Could not load ad sets: {adsets.error}</div>}
        {Array.isArray(adsets) && (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Ad Set</th>
                  <th>Status</th>
                  <th className="r">Budget</th>
                  <th>Type</th>
                  <th>Has schedule?</th>
                </tr>
              </thead>
              <tbody>
                {adsets.map(a => (
                  <tr key={a.id} className="day-row" onClick={() => togglePick(a.id)}>
                    <td><input type="checkbox" checked={picked.has(a.id)} readOnly /></td>
                    <td style={{ fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</td>
                    <td><span className={`tag ${a.status === 'ACTIVE' ? 'inc' : 'mon'}`}>{a.status}</span></td>
                    <td className="r">{a.budget_type === 'lifetime' ? $(a.lifetime_budget, 0) : $(a.daily_budget, 0)}</td>
                    <td>{a.budget_type}</td>
                    <td>{a.has_schedule ? <span className="tag inc">YES</span> : <span style={{ color: 'var(--at3)' }}>no</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1.25rem', flexWrap: 'wrap' }}>
          <button className="go" onClick={apply} disabled={loading || !picked.size}>
            {loading ? 'Creating copies...' : `Duplicate & Schedule ${picked.size} Ad Set(s)`}
          </button>
          <span style={{ fontSize: '.75rem', color: 'var(--at3)' }}>Ad sets remain PAUSED. You activate them manually in Meta.</span>
        </div>

        {results && (
          <div style={{ marginTop: '1.25rem' }}>
            {results.map((r, i) => (
              <div key={i} className="snap-info" style={{ marginBottom: '.5rem', borderColor: r.ok ? 'rgba(74,222,128,.4)' : 'rgba(248,113,113,.4)' }}>
                <b style={{ color: r.ok ? 'var(--grn)' : 'var(--red)' }}>{r.ok ? '✓' : '✕'}</b> {r.id}: {r.msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DOWTab({ dowS }) {
  return (
    <div className="sec">
      <h2 className="sh">Day-of-Week Efficiency</h2>
      <p style={{ fontSize: '.78rem', color: 'var(--at2)', marginBottom: '1rem' }}>Ranked by cost per messaging reply — cheapest first</p>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th className="r">Avg Spend/Day</th>
              <th className="r">Avg Messages</th>
              <th className="r">$/Reply</th>
              <th style={{ width: '100px' }}>Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {dowS.map((d, i) => {
              const best = dowS[0].cpr || 1;
              const worst = dowS[dowS.length - 1].cpr || best + 1;
              const ratio = d.cpr ? Math.max(0, 1 - (d.cpr - best) / (worst - best || 1)) : 0;
              return (
                <tr key={d.day}>
                  <td style={{ fontWeight: 600 }}>{d.day}</td>
                  <td className="r">{$(d.avgSpend, 0)}</td>
                  <td className="r">{fmt(d.avgMsgs, 1)}</td>
                  <td className={`r ${i === 0 ? 'best' : i === dowS.length - 1 ? 'worst' : ''}`}>{d.cpr ? $(d.cpr) : '\u2014'}</td>
                  <td><div className="bt" style={{ width: '90px' }}><div className={`bf ${ratio > 0.7 ? 'g' : ratio > 0.4 ? 'o' : 'r'}`} style={{ width: Math.max(5, ratio * 100) + '%' }}></div></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══ MAIN DASHBOARD ═══
export default function Dashboard() {
  const [sd, setSd] = useState(() => gp('30d').since);
  const [ed, setEd] = useState(() => gp('30d').until);
  const [ap, setAp] = useState('30d');
  const [ld, setLd] = useState(false);
  const [err, setErr] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');

  const sp = (p) => { const d = gp(p); setSd(d.since); setEd(d.until); setAp(p); };

  const go = useCallback(async () => {
    setLd(true); setErr(null); setData(null);
    try {
      const d = await api.getAnalytics(sd, ed);
      setData(d);
    } catch (e) { setErr('Failed: ' + e.message); }
    setLd(false);
  }, [sd, ed]);

  useEffect(() => { go(); }, []);

  const { camps = [], ads = [], days = [], dowS = [], funnel = {}, weekly = [], totals = {}, fetchTime } = data || {};
  const { tSpend = 0, tMsgs = 0, avgCPR = 0, bCTR = 0, bCPM = 0, tReach = 0 } = totals;
  const nDays = Math.max(1, Math.round((new Date(ed) - new Date(sd)) / 864e5));

  return (
    <div className="analyzer">
      <style>{STYLES}</style>
      <h1>SAHIBA — Meta Ads Analyzer</h1>
      <p className="sub">Live performance · Daily spend · Ad-level breakdown · Budget verdicts</p>

      <div className="ctl">
        <div>
          <label>From</label><br />
          <input type="date" value={sd} onChange={e => { setSd(e.target.value); setAp(null); }} />
        </div>
        <div>
          <label>To</label><br />
          <input type="date" value={ed} onChange={e => { setEd(e.target.value); setAp(null); }} />
        </div>
        <div>
          <label>Presets</label><br />
          <div className="pbtn">
            {[['7d', '7 Days'], ['14d', '14 Days'], ['30d', '30 Days'], ['90d', '90 Days'], ['120d', '120 Days'], ['this_month', 'This Month'], ['last_month', 'Last Month']].map(([k, l]) => (
              <button key={k} className={`pb ${ap === k ? 'a' : ''}`} onClick={() => sp(k)}>{l}</button>
            ))}
          </div>
        </div>
        <button className="go" onClick={go} disabled={ld}>{ld ? 'Analyzing...' : 'Analyze'}</button>
      </div>

      {err && <div className="err">{err}</div>}
      {ld && <div className="ld"><div className="sp"></div><p>Pulling live data from Pipeboard...</p></div>}
      {!ld && !data && !err && <div className="es"><h2>Select dates and hit Analyze</h2><p>Pulls live data from Pipeboard: campaigns, daily spend, individual ads, and messaging funnel.</p></div>}

      {data && (
        <div>
          <div className="kr">
            <div className="k"><div className="l">Total Spend</div><div className="v">{$(tSpend, 0)}</div><div className="s">~{$(tSpend / nDays, 0)}/day · {nDays} days</div></div>
            <div className="k"><div className="l">Messaging Replies</div><div className="v">{fmt(tMsgs)}</div><div className="s">{fmt(tMsgs / nDays, 1)}/day</div></div>
            <div className="k"><div className="l">Cost / Reply</div><div className="v">{tMsgs > 0 ? $(avgCPR) : '\u2014'}</div><div className="s">North star</div></div>
            <div className="k"><div className="l">CTR</div><div className="v">{pct(bCTR)}</div><div className="s">Blended</div></div>
            <div className="k"><div className="l">CPM</div><div className="v">{$(bCPM)}</div><div className="s">Per 1K imps</div></div>
            <div className="k"><div className="l">Reach</div><div className="v">{tReach > 1e6 ? fmt(tReach / 1e6, 1) + 'M' : tReach > 1e3 ? fmt(tReach / 1e3, 0) + 'K' : fmt(tReach)}</div><div className="s">Unique people</div></div>
          </div>

          <div className="tabs">
            {[['overview', 'Overview'], ['health', 'Daily Health 🩺'], ['newcamp', 'New Campaign 🚀'], ['promote', 'Promote IG 📸'], ['tiktok', 'TikTok 🎵'], ['bestdays', 'Best Days ⭐'], ['hours', 'Best Hours ⏰'], ['salesroi', 'Sales & ROI 💰'], ['georoi', 'Geo ROI 🗺️'], ['schedule', 'Schedule 🤖'], ['depth', 'Conversation Quality'], ['recs', 'Recommendations'], ['tracker', 'Performance Tracker'], ['daily', 'Daily Spend'], ['ads', 'Ad Breakdown'], ['dow', 'Day of Week']].map(([k, l]) => (
              <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === 'overview' && <OverviewTab camps={camps} avgCPR={avgCPR} funnel={funnel} weekly={weekly} totals={data.totals} dowRich={data.dowRich} ads={ads} nDays={nDays} />}
          {tab === 'health' && <DailyHealthTab />}
          {tab === 'promote' && <PromoteIgTab />}
          {tab === 'newcamp' && <NewCampaignTab />}
          {tab === 'tiktok' && <TikTokTab />}
          {tab === 'bestdays' && <BestDaysTab dowRich={data.dowRich} />}
          {tab === 'hours' && <HourTab hourRich={data.hourRich} />}
          {tab === 'salesroi' && <SalesROITab />}
          {tab === 'georoi' && <GeoROITab />}
          {tab === 'schedule' && <ScheduleTab hourRich={data.hourRich} />}
          {tab === 'depth' && <DepthTab ads={ads} />}
          {tab === 'recs' && <RecsTab ads={ads} camps={camps} tSpend={tSpend} nDays={nDays} />}
          {tab === 'tracker' && <TrackerTab ads={ads} tSpend={tSpend} tMsgs={tMsgs} bCTR={bCTR} bCPM={bCPM} tReach={tReach} nDays={nDays} />}
          {tab === 'daily' && <DailyTab days={days} />}
          {tab === 'ads' && <AdsTab ads={ads} />}
          {tab === 'dow' && <DOWTab dowS={dowS} />}

          <p className="ts">Fetched in {fetchTime}s · {sd} → {ed} · {camps.length} campaigns · {ads.length} ads</p>
        </div>
      )}
    </div>
  );
}
