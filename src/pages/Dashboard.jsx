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
function OverviewTab({ camps, avgCPR, funnel, weekly }) {
  const maxWS = Math.max(...weekly.map(w => w.spend), 1);
  return (
    <div>
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
            {[['7d', '7 Days'], ['14d', '14 Days'], ['30d', '30 Days'], ['90d', '90 Days'], ['this_month', 'This Month'], ['last_month', 'Last Month']].map(([k, l]) => (
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
            {[['overview', 'Overview'], ['depth', 'Conversation Quality'], ['recs', 'Recommendations'], ['tracker', 'Performance Tracker'], ['daily', 'Daily Spend'], ['ads', 'Ad Breakdown'], ['dow', 'Day of Week']].map(([k, l]) => (
              <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          {tab === 'overview' && <OverviewTab camps={camps} avgCPR={avgCPR} funnel={funnel} weekly={weekly} />}
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
