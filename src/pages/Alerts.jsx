import { useState, useEffect } from 'react';
import { api } from '../api';

const SEVERITY_STYLES = {
  critical: { bg: 'bg-red-50 border-red-200', icon: '\u{1F6A8}', label: 'bg-red-100 text-red-700' },
  warning: { bg: 'bg-yellow-50 border-yellow-200', icon: '\u26A0\uFE0F', label: 'bg-yellow-100 text-yellow-700' },
  info: { bg: 'bg-blue-50 border-blue-200', icon: '\u2139\uFE0F', label: 'bg-blue-100 text-blue-700' }
};

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setAlerts(await api.getAlerts()); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resolve = async (id) => {
    await api.resolveAlert(id);
    load();
  };

  const filtered = showResolved ? alerts : alerts.filter(a => !a.resolved);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 gap-3"><div className="w-5 h-5 border-2 border-gray-300 border-t-fb rounded-full animate-spin" />Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Alerts ({filtered.filter(a => !a.resolved).length} active)</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} className="rounded" />
          Show resolved
        </label>
      </div>

      <div className="space-y-3">
        {filtered.map(a => {
          const style = SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.info;
          return (
            <div key={a.id} className={`rounded-xl border p-4 flex items-start gap-3 ${style.bg} ${a.resolved ? 'opacity-50' : ''}`}>
              <span className="text-xl mt-0.5">{style.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${style.label}`}>{a.severity}</span>
                  <span className="text-[11px] text-gray-500">{a.type}</span>
                  {a.campaign_name && <span className="text-[11px] text-gray-400">| {a.campaign_name}</span>}
                </div>
                <p className="text-sm text-gray-800">{a.message}</p>
                <p className="text-[11px] text-gray-400 mt-1">{new Date(a.created_at).toLocaleString()}</p>
              </div>
              {!a.resolved && (
                <button onClick={() => resolve(a.id)} className="px-3 py-1 bg-white border border-gray-300 rounded text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  Resolve
                </button>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No alerts — all clear!</div>}
    </div>
  );
}
