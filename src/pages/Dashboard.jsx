import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import KpiCard from '../components/KpiCard';
import { fmtMoney, fmtNum, fmtPct, today, daysAgo } from '../utils/format';

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

const VERDICT_STYLES = {
  INCREASE_BUDGET: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', icon: '\u2B06' },
  REACTIVATE: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: '\u25B6' },
  TEST_AT_SCALE: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', icon: '\u{1F9EA}' },
  DECREASE_BUDGET: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', icon: '\u2B07' },
  PAUSE: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: '\u23F8' },
  MONITOR: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300', icon: '\u{1F440}' },
};

function VerdictBadge({ verdict }) {
  const s = VERDICT_STYLES[verdict] || VERDICT_STYLES.MONITOR;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${s.bg} ${s.text} ${s.border}`}>{s.icon} {verdict.replace(/_/g, ' ')}</span>;
}

function MessagingFunnel({ data }) {
  const stages = [
    { key: 'connections', label: 'Conexiones', color: '#3b82f6' },
    { key: 'first_reply', label: 'Primera Respuesta', color: '#8b5cf6' },
    { key: 'depth_2', label: '2+ Mensajes', color: '#f59e0b' },
    { key: 'depth_3', label: '3+ Mensajes', color: '#ef4444' },
    { key: 'depth_5', label: '5+ Mensajes', color: '#10b981' },
  ];
  const maxVal = Math.max(...stages.map(s => data[s.key] || 0), 1);

  return (
    <div className="space-y-2">
      {stages.map((stage, i) => {
        const val = data[stage.key] || 0;
        const pct = (val / maxVal) * 100;
        const prev = i > 0 ? (data[stages[i - 1].key] || 0) : 0;
        const rate = i > 0 && prev > 0 ? ((val / prev) * 100).toFixed(0) + '%' : '';
        return (
          <div key={stage.key} className="flex items-center gap-3">
            <div className="w-28 text-right text-[11px] font-medium text-gray-600">{stage.label}</div>
            <div className="flex-1 h-7 bg-gray-100 rounded overflow-hidden relative">
              <div className="h-full rounded flex items-center px-2 transition-all" style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: stage.color }}>
                <span className="text-white text-[11px] font-bold">{fmtNum(val)}</span>
              </div>
            </div>
            <div className="w-10 text-[11px] text-gray-500 font-medium text-right">{rate}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await api.getAnalytics(dateFrom, dateTo);
      setData(d);
    } catch (e) {
      // Fallback to cached dashboard
      try {
        const d = await api.getDashboard(dateFrom, dateTo);
        setData({ fallback: true, ...d });
      } catch (e2) { setError(e.message); }
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const setPreset = (days) => { setDateFrom(daysAgo(days)); setDateTo(today()); };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 gap-3"><div className="w-5 h-5 border-2 border-gray-300 border-t-fb rounded-full animate-spin" />Cargando análisis en vivo...</div>;
  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">Error: {error}</div>;
  if (!data) return null;

  const k = data.kpis || data.totals || {};

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Análisis de Rendimiento</h2>
          <p className="text-sm text-gray-500">{data.period?.from || dateFrom} → {data.period?.to || dateTo}</p>
        </div>
        <div className="flex items-center gap-2">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => setPreset(p.days)} className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200">{p.label}</button>
          ))}
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-xs" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-xs" />
          <button onClick={load} className="px-4 py-1 bg-fb text-white rounded-lg text-xs font-bold">Actualizar</button>
        </div>
      </div>

      {/* KPI Row — cost per reply is the hero */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Gasto Total" value={fmtMoney(k.total_spend)} color="#6366f1" />
        <KpiCard label="Respuestas WhatsApp" value={fmtNum(k.messaging_replies)} sub="Primera respuesta" color="#25D366" />
        <KpiCard label="Costo por Respuesta" value={fmtMoney(k.cost_per_reply)} sub="Métrica principal" color={k.cost_per_reply < 2 ? '#10b981' : k.cost_per_reply < 4 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="CTR" value={fmtPct(k.ctr)} color="#3b82f6" />
        <KpiCard label="CPM" value={fmtMoney(k.cpm)} color="#8b5cf6" />
        <KpiCard label="Alcance" value={fmtNum(k.reach)} color="#06b6d4" />
      </div>

      {/* Insights bar */}
      {data.insights && data.insights.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl border border-blue-200 p-4 space-y-2">
          <h3 className="text-xs font-bold text-blue-800 uppercase">Insights</h3>
          {data.insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span>{ins.type === 'opportunity' ? '\u{1F4A1}' : '\u26A1'}</span>
              <span>{ins.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Campaign Verdict Cards */}
      {data.campaigns && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold">Campañas — Ranking por Costo/Respuesta</h3>
            <span className="text-[10px] text-gray-500">{data.campaigns.length} campañas con gasto</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-gray-500 uppercase">#</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-gray-500 uppercase">Campaña</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-gray-500 uppercase">Veredicto</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold text-gray-500 uppercase">Gasto</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold text-gray-500 uppercase">Respuestas</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold text-gray-500 uppercase">$/Respuesta</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold text-gray-500 uppercase">CPC</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold text-gray-500 uppercase">CTR</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c, i) => (
                  <tr key={c.campaign_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-400 font-bold">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs font-semibold text-gray-900 max-w-[200px] truncate">{c.campaign_name}</div>
                    </td>
                    <td className="px-4 py-2.5"><VerdictBadge verdict={c.verdict} /></td>
                    <td className="px-4 py-2.5 text-xs text-right font-medium">{fmtMoney(c.spend)}</td>
                    <td className="px-4 py-2.5 text-xs text-right font-bold text-green-700">{c.messaging_replies}</td>
                    <td className="px-4 py-2.5 text-xs text-right">
                      <span className={`font-bold ${c.cost_per_reply && c.cost_per_reply < (k.cost_per_reply || 2) ? 'text-green-700' : c.cost_per_reply > (k.cost_per_reply || 2) * 2 ? 'text-red-600' : 'text-gray-700'}`}>
                        {c.cost_per_reply ? fmtMoney(c.cost_per_reply) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right text-gray-600">{fmtMoney(c.cpc)}</td>
                    <td className="px-4 py-2.5 text-xs text-right text-gray-600">{fmtPct(c.ctr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Day of Week + Messaging Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Day of Week Analysis */}
        {data.day_of_week && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-bold">Eficiencia por Día</h3>
              {data.weekend_advantage > 20 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">Fines de semana {data.weekend_advantage}% mejor</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 text-[10px] font-bold text-gray-500">Día</th>
                    <th className="text-right px-3 py-2 text-[10px] font-bold text-gray-500">Gasto Prom</th>
                    <th className="text-right px-3 py-2 text-[10px] font-bold text-gray-500">Respuestas</th>
                    <th className="text-right px-3 py-2 text-[10px] font-bold text-gray-500">$/Respuesta</th>
                  </tr>
                </thead>
                <tbody>
                  {data.day_of_week.map((d, i) => {
                    const isWeekend = d.day === 'Saturday' || d.day === 'Sunday';
                    return (
                      <tr key={d.day} className={`border-b border-gray-100 ${isWeekend ? 'bg-green-50' : ''}`}>
                        <td className="px-3 py-2 text-xs font-medium">{d.day} {isWeekend ? '\u2B50' : ''}</td>
                        <td className="px-3 py-2 text-xs text-right">{fmtMoney(d.avg_spend)}</td>
                        <td className="px-3 py-2 text-xs text-right font-bold text-green-700">{d.avg_replies}</td>
                        <td className="px-3 py-2 text-xs text-right">
                          <span className={`font-bold ${i === 0 ? 'text-green-700' : i >= data.day_of_week.length - 2 ? 'text-red-600' : 'text-gray-700'}`}>
                            {d.cost_per_reply ? fmtMoney(d.cost_per_reply) : '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Messaging Funnel */}
        {data.funnel && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold mb-4">Embudo de WhatsApp</h3>
            <MessagingFunnel data={data.funnel} />
          </div>
        )}
      </div>
    </div>
  );
}
