import { useState, useEffect } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { LEAD_STAGES } from '../utils/constants';
import { fmtMoney } from '../utils/format';

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showSale, setShowSale] = useState(null);
  const [filterStage, setFilterStage] = useState('ALL');
  const [form, setForm] = useState({ phone: '', name: '', campaign_meta_id: '', source: 'whatsapp', stage: 'cold', agent_id: '', notes: '' });
  const [saleForm, setSaleForm] = useState({ amount: '', product: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [l, c, a] = await Promise.all([api.getLeads(), api.getCampaigns(), api.getAgents()]);
      setLeads(l);
      setCampaigns(c);
      setAgents(a);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.phone) return alert('Phone is required');
    await api.createLead(form);
    setShowAdd(false);
    setForm({ phone: '', name: '', campaign_meta_id: '', source: 'whatsapp', stage: 'cold', agent_id: '', notes: '' });
    load();
  };

  const updateStage = async (id, stage) => {
    await api.updateLead(id, { stage });
    load();
  };

  const handleSale = async () => {
    if (!saleForm.amount) return alert('Amount is required');
    await api.createSale({
      lead_id: showSale.id,
      campaign_meta_id: showSale.campaign_meta_id,
      agent_id: showSale.agent_id,
      amount: parseFloat(saleForm.amount),
      product: saleForm.product
    });
    setShowSale(null);
    setSaleForm({ amount: '', product: '' });
    load();
  };

  const filtered = filterStage === 'ALL' ? leads : leads.filter(l => l.stage === filterStage);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 gap-3"><div className="w-5 h-5 border-2 border-gray-300 border-t-fb rounded-full animate-spin" />Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Leads ({leads.length})</h2>
        <div className="flex gap-2">
          {['ALL', ...Object.keys(LEAD_STAGES)].map(s => (
            <button key={s} onClick={() => setFilterStage(s)}
              className={`px-3 py-1 rounded-full text-xs font-bold ${filterStage === s ? 'bg-fb text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s === 'ALL' ? 'All' : LEAD_STAGES[s].label}
            </button>
          ))}
          <button onClick={() => setShowAdd(true)} className="px-4 py-1 bg-fb text-white rounded-lg text-xs font-bold hover:bg-fb-dark">+ Add Lead</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Name</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Phone</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Stage</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Campaign</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Agent</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Notes</th>
                <th className="text-center px-4 py-2.5 text-[11px] font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-sm font-semibold">{l.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{l.phone}</td>
                  <td className="px-4 py-3">
                    <select value={l.stage} onChange={e => updateStage(l.id, e.target.value)}
                      className={`text-xs font-bold rounded-full px-2.5 py-0.5 border-0 ${LEAD_STAGES[l.stage]?.color || 'bg-gray-100'}`}>
                      {Object.entries(LEAD_STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate">{l.campaign_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{l.agent_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate">{l.notes || ''}</td>
                  <td className="px-4 py-3 text-center">
                    {l.stage !== 'customer' && (
                      <button onClick={() => setShowSale(l)} className="px-3 py-1 rounded text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200">
                        Mark Sale
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No leads found</div>}
      </div>

      {/* Add Lead Modal */}
      {showAdd && (
        <Modal title="Add Lead" onClose={() => setShowAdd(false)} footer={<>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold" onClick={() => setShowAdd(false)}>Cancel</button>
          <button className="px-4 py-2 bg-fb text-white rounded-lg text-sm font-semibold" onClick={handleAdd}>Add Lead</button>
        </>}>
          <div className="space-y-4">
            <div><label className="block text-sm font-semibold mb-1">Phone *</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+52..." /></div>
            <div><label className="block text-sm font-semibold mb-1">Name</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
            <div><label className="block text-sm font-semibold mb-1">Campaign</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.campaign_meta_id} onChange={e => setForm({...form, campaign_meta_id: e.target.value})}>
                <option value="">Unknown</option>
                {campaigns.map(c => <option key={c.meta_id} value={c.meta_id}>{c.name}</option>)}
              </select></div>
            <div><label className="block text-sm font-semibold mb-1">Agent</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.agent_id} onChange={e => setForm({...form, agent_id: e.target.value})}>
                <option value="">Unassigned</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></div>
            <div><label className="block text-sm font-semibold mb-1">Stage</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.stage} onChange={e => setForm({...form, stage: e.target.value})}>
                {Object.entries(LEAD_STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
            <div><label className="block text-sm font-semibold mb-1">Notes</label>
              <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={3} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></div>
          </div>
        </Modal>
      )}

      {/* Record Sale Modal */}
      {showSale && (
        <Modal title={`Record Sale — ${showSale.name || showSale.phone}`} onClose={() => setShowSale(null)} footer={<>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold" onClick={() => setShowSale(null)}>Cancel</button>
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold" onClick={handleSale}>Record Sale</button>
        </>}>
          <div className="space-y-4">
            <div><label className="block text-sm font-semibold mb-1">Amount (USD) *</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" type="number" value={saleForm.amount} onChange={e => setSaleForm({...saleForm, amount: e.target.value})} /></div>
            <div><label className="block text-sm font-semibold mb-1">Product</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={saleForm.product} onChange={e => setSaleForm({...saleForm, product: e.target.value})} placeholder="e.g. Vestido 517" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
