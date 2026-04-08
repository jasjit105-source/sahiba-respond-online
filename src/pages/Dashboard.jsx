import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api';
import KpiCard from '../components/KpiCard';
import FunnelChart from '../components/FunnelChart';
import StatusBadge from '../components/StatusBadge';
import AiLabel from '../components/AiLabel';
import { fmtMoney, fmtNum, fmtPct, today, daysAgo } from '../utils/format';

export default function Dashboard() {
  const [dateFrom, setDateFrom] = useState(daysAgo(365));
  const [dateTo, setDateTo] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.getDashboard(dateFrom, dateTo);
      setData(d);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.sync();
      await load();
    } catch (e) { alert('Sync failed: ' + e.message); }
    setSyncing(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 gap-3"><div className="w-5 h-5 border-2 border-gray-300 border-t-fb rounded-full animate-spin" />Loading...</div>;
  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">Error: {error}</div>;
  if (!data) return null;

  const { totals, dailyTrend, campaignPerf, funnel, totalSales, alerts } = data;

  const costPerConversation = funnel.conversations > 0 ? totals.total_spend / funnel.conversations : 0;
  const costPerLead = funnel.qualified > 0 ? totals.total_spend / funnel.qualified : 0;
  const costPerSale = funnel.sales > 0 ? totals.total_spend / funnel.sales : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Dashboard</h2>
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={load} className="px-4 py-1.5 bg-fb text-white rounded-lg text-sm font-semibold hover:bg-fb-dark">Refresh</button>
          <button onClick={handleSync} disabled={syncing} className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 disabled:opacity-50">
            {syncing ? 'Syncing...' : 'Sync Meta'}
          </button>
        </div>
      </div>

      {/* KPI Row 1: Ad Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Spend" value={fmtMoney(totals.total_spend)} color="#1877f2" />
        <KpiCard label="Impressions" value={fmtNum(totals.total_impressions)} color="#7c3aed" />
        <KpiCard label="Link Clicks" value={fmtNum(totals.total_link_clicks)} sub="WhatsApp" color="#25D366" />
        <KpiCard label="CTR" value={fmtPct(totals.avg_ctr)} color="#f59e0b" />
        <KpiCard label="CPC" value={fmtMoney(totals.avg_cpc)} color="#ef4444" />
        <KpiCard label="Reach" value={fmtNum(totals.total_reach)} color="#10b981" />
      </div>

      {/* KPI Row 2: Funnel Costs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Cost / Conversation" value={fmtMoney(costPerConversation)} sub={`${funnel.conversations} conversations`} color="#7c3aed" />
        <KpiCard label="Cost / Qualified Lead" value={fmtMoney(costPerLead)} sub={`${funnel.qualified} qualified`} color="#f59e0b" />
        <KpiCard label="Cost / Sale" value={fmtMoney(costPerSale)} sub={`${funnel.sales} sales`} color="#10b981" />
        <KpiCard label="Total Revenue" value={fmtMoney(totalSales)} sub="All time" color="#059669" />
      </div>

      {/* Funnel + Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Conversion Funnel</h3>
          <FunnelChart data={funnel} />
        </div>

        {/* Spend Trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Daily Spend Trend</h3>
          {dailyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => ['$' + Number(v).toFixed(2)]} />
                <Area type="monotone" dataKey="spend" stroke="#1877f2" fill="#e7f3ff" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div className="text-gray-400 text-sm text-center py-10">No data for this period</div>}
        </div>
      </div>

      {/* Campaign Performance Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-bold">Campaign Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Campaign</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Category</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">AI</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Spend</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Clicks</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">CTR</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">CPC</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Freq</th>
              </tr>
            </thead>
            <tbody>
              {campaignPerf.map(c => (
                <tr key={c.meta_id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 max-w-[200px] truncate">{c.name}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-600">{c.category}</td>
                  <td className="px-4 py-3"><AiLabel label={c.ai_label} /></td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{fmtMoney(c.spend)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmtNum(c.clicks)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmtPct(c.ctr)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmtMoney(c.cpc)}</td>
                  <td className="px-4 py-3 text-sm text-right">{c.frequency ? Number(c.frequency).toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h3 className="text-sm font-bold">Active Alerts</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {alerts.map(a => (
              <div key={a.id} className={`px-5 py-3 flex items-center gap-3 ${a.severity === 'critical' ? 'bg-red-50' : a.severity === 'warning' ? 'bg-yellow-50' : 'bg-blue-50'}`}>
                <span className="text-lg">{a.severity === 'critical' ? '\u{1F6A8}' : a.severity === 'warning' ? '\u{26A0}\uFE0F' : '\u{2139}\uFE0F'}</span>
                <span className="text-sm flex-1">{a.message}</span>
                <span className="text-[11px] text-gray-400">{a.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
