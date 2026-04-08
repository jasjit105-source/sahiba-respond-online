import { useState, useEffect } from 'react';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import { fmtMoney, fmtNum, fmtPct } from '../utils/format';

export default function AdSets() {
  const [adsets, setAdsets] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [filterCampaign, setFilterCampaign] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        api.getAdsets(filterCampaign || undefined),
        api.getCampaigns()
      ]);
      setAdsets(a);
      setCampaigns(c);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterCampaign]);

  const toggleStatus = async (metaId, currentStatus) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    if (!confirm(`Change ad set status to ${newStatus}?`)) return;
    await api.updateAdset(metaId, { status: newStatus });
    load();
  };

  const getCampaignName = (metaId) => campaigns.find(c => c.meta_id === metaId)?.name || metaId;

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 gap-3"><div className="w-5 h-5 border-2 border-gray-300 border-t-fb rounded-full animate-spin" />Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Ad Sets</h2>
        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">All Campaigns</option>
          {campaigns.map(c => <option key={c.meta_id} value={c.meta_id}>{c.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Ad Set</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Campaign</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Optimization</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Budget</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Spend</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Clicks</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">CTR</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {adsets.map(a => (
                <tr key={a.meta_id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 max-w-[180px] truncate">{a.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate">{getCampaignName(a.campaign_meta_id)}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-600">{a.optimization_goal || '—'}</td>
                  <td className="px-4 py-3 text-sm text-right">{a.daily_budget ? fmtMoney(a.daily_budget) + '/d' : '—'}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{fmtMoney(a.total_spend)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmtNum(a.total_clicks)}</td>
                  <td className="px-4 py-3 text-sm text-right">{fmtPct(a.avg_ctr)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleStatus(a.meta_id, a.status)}
                      className={`px-3 py-1 rounded text-xs font-bold ${a.status === 'ACTIVE' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                    >
                      {a.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {adsets.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No ad sets found</div>}
      </div>
    </div>
  );
}
