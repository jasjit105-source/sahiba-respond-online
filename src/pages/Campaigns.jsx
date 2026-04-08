import { useState, useEffect } from 'react';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import AiLabel from '../components/AiLabel';
import { fmtMoney, fmtNum, fmtPct } from '../utils/format';
import { CAMPAIGN_CATEGORIES } from '../utils/constants';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  const load = async () => {
    setLoading(true);
    try { setCampaigns(await api.getCampaigns()); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleStatus = async (metaId, currentStatus) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    if (!confirm(`Change campaign status to ${newStatus}?`)) return;
    await api.updateCampaign(metaId, { status: newStatus });
    load();
  };

  const setCategory = async (metaId, category) => {
    await api.updateCampaign(metaId, { category });
    load();
  };

  const filtered = filter === 'ALL' ? campaigns : campaigns.filter(c => c.category === filter);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 gap-3"><div className="w-5 h-5 border-2 border-gray-300 border-t-fb rounded-full animate-spin" />Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Campaigns</h2>
        <div className="flex gap-2">
          {['ALL', ...Object.keys(CAMPAIGN_CATEGORIES)].map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${filter === cat ? 'bg-fb text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {cat === 'ALL' ? 'All' : CAMPAIGN_CATEGORIES[cat]?.label || cat}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Campaign</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Category</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">AI Label</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Spend</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Clicks</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Link Clicks</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">CTR</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">CPC</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Frequency</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.meta_id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900 max-w-[180px] truncate">{c.name}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{c.objective}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3">
                    <select
                      value={c.category}
                      onChange={e => setCategory(c.meta_id, e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1"
                    >
                      {Object.entries(CAMPAIGN_CATEGORIES).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3"><AiLabel label={c.ai_label} /></td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{fmtMoney(c.total_spend)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmtNum(c.total_clicks)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmtNum(c.total_link_clicks)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmtPct(c.avg_ctr)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmtMoney(c.avg_cpc)}</td>
                  <td className="px-4 py-3 text-sm text-right">{c.avg_frequency ? Number(c.avg_frequency).toFixed(1) : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleStatus(c.meta_id, c.status)}
                      className={`px-3 py-1 rounded text-xs font-bold ${c.status === 'ACTIVE' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                    >
                      {c.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No campaigns in this category</div>}
      </div>
    </div>
  );
}
