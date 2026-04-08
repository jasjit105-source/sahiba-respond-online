import { useState, useEffect } from 'react';
import { api } from '../api';
import { fmtMoney, fmtNum, fmtPct } from '../utils/format';
import AiLabel from '../components/AiLabel';

export default function DailyReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getDailyReport();
      setReport(r);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 gap-3"><div className="w-5 h-5 border-2 border-gray-300 border-t-fb rounded-full animate-spin" />Generating report...</div>;
  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">Error: {error}</div>;
  if (!report) return null;

  const { summary, winners, losers, bottlenecks, actions, tests, campaigns } = report;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Daily AI Report</h2>
          <p className="text-sm text-gray-500">{report.date}</p>
        </div>
        <button onClick={load} className="px-4 py-1.5 bg-fb text-white rounded-lg text-sm font-semibold hover:bg-fb-dark">Regenerate</button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] font-bold text-gray-500 uppercase">Total Spend</div>
          <div className="text-xl font-extrabold text-gray-900 mt-1">{fmtMoney(summary.total_spend)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] font-bold text-gray-500 uppercase">Link Clicks</div>
          <div className="text-xl font-extrabold text-gray-900 mt-1">{fmtNum(summary.total_link_clicks)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] font-bold text-gray-500 uppercase">Conversations</div>
          <div className="text-xl font-extrabold text-gray-900 mt-1">{fmtNum(summary.conversations)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[11px] font-bold text-gray-500 uppercase">Sales</div>
          <div className="text-xl font-extrabold text-gray-900 mt-1">{fmtNum(summary.sales)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Winners */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-green-50">
            <h3 className="text-sm font-bold text-green-800">Winning Campaigns</h3>
          </div>
          <div className="p-4">
            {winners.length === 0 ? (
              <p className="text-sm text-gray-400">No clear winners yet — need more data</p>
            ) : winners.map((w, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{w.name}</div>
                  <div className="text-xs text-gray-500">Spend: {fmtMoney(w.spend)} | CTR: {fmtPct(w.ctr)} | Clicks: {fmtNum(w.link_clicks)}</div>
                </div>
                <AiLabel label={w.label} />
              </div>
            ))}
          </div>
        </div>

        {/* Losers */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-red-50">
            <h3 className="text-sm font-bold text-red-800">Losing Campaigns</h3>
          </div>
          <div className="p-4">
            {losers.length === 0 ? (
              <p className="text-sm text-gray-400">No losers detected — all campaigns performing OK</p>
            ) : losers.map((l, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{l.name}</div>
                  <div className="text-xs text-gray-500">Spend: {fmtMoney(l.spend)} | CTR: {fmtPct(l.ctr)} | Clicks: {fmtNum(l.link_clicks)}</div>
                </div>
                <AiLabel label={l.label} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottlenecks */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-yellow-50">
          <h3 className="text-sm font-bold text-yellow-800">Funnel Bottlenecks</h3>
        </div>
        <div className="p-4 space-y-2">
          {bottlenecks.map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="text-yellow-500 mt-0.5">&#9888;</span>
              <span>{b}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 3 Actions */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-blue-50">
            <h3 className="text-sm font-bold text-blue-800">3 Actions to Take Today</h3>
          </div>
          <div className="p-4 space-y-3">
            {actions.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-fb text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <span className="text-sm text-gray-700">{a}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 3 Tests */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-purple-50">
            <h3 className="text-sm font-bold text-purple-800">3 Tests to Launch</h3>
          </div>
          <div className="p-4 space-y-3">
            {tests.map((t, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <span className="text-sm text-gray-700">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* All Campaigns Summary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold">All Campaigns — AI Labels</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2 text-[11px] font-bold text-gray-500 uppercase">Campaign</th>
                <th className="text-left px-4 py-2 text-[11px] font-bold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-2 text-[11px] font-bold text-gray-500 uppercase">AI Label</th>
                <th className="text-right px-4 py-2 text-[11px] font-bold text-gray-500 uppercase">Spend</th>
                <th className="text-right px-4 py-2 text-[11px] font-bold text-gray-500 uppercase">CTR</th>
                <th className="text-right px-4 py-2 text-[11px] font-bold text-gray-500 uppercase">CPC</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-medium max-w-[200px] truncate">{c.name}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-2.5"><AiLabel label={c.ai_label} /></td>
                  <td className="px-4 py-2.5 text-sm text-right">{fmtMoney(c.spend)}</td>
                  <td className="px-4 py-2.5 text-sm text-right">{fmtPct(c.ctr)}</td>
                  <td className="px-4 py-2.5 text-sm text-right">{fmtMoney(c.cpc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
