import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  const load = async () => {
    setLoading(true);
    try { setAgents(await api.getAgents()); }
    catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addAgent = async () => {
    if (!newName.trim()) return;
    await api.createAgent({ name: newName.trim() });
    setNewName('');
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 gap-3"><div className="w-5 h-5 border-2 border-gray-300 border-t-fb rounded-full animate-spin" />Loading...</div>;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Agents</h2>

      {/* Add Agent */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex gap-3">
          <input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Agent name" onKeyDown={e => { if (e.key === 'Enter') addAgent(); }} />
          <button onClick={addAgent} className="px-4 py-2 bg-fb text-white rounded-lg text-sm font-semibold hover:bg-fb-dark">Add Agent</button>
        </div>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(a => (
          <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-base font-bold text-gray-900">{a.name}</h3>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <div className="text-[11px] font-bold text-gray-500 uppercase">Leads</div>
                <div className="text-xl font-extrabold text-gray-900">{a.total_leads}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-gray-500 uppercase">Hot</div>
                <div className="text-xl font-extrabold text-orange-600">{a.hot_leads}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-gray-500 uppercase">Sales</div>
                <div className="text-xl font-extrabold text-green-600">{a.total_sales}</div>
              </div>
            </div>
            {a.total_leads > 0 && (
              <div className="mt-3 text-xs text-gray-500">
                Conversion: <span className="font-bold text-gray-800">{((a.total_sales / a.total_leads) * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {agents.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No agents yet. Add your first agent above.</div>}
    </div>
  );
}
