// CMO Report page (sidebar slot was "AI Report", now labeled "CMO Report").
// Pulls last 30 days of Meta analytics across all live accounts and renders the
// strategic CMO recommendations (StopNow / ScaleNow / Fatigue / Reduce / Watch /
// Cook / Keep) with one-click action logging. Same RecsTab component that lives
// on the Today dashboard — both kept in sync via the named export from Dashboard.jsx.
import { useState, useEffect } from 'react';
import { api } from '../api';
import { RecsTab, STYLES } from './Dashboard';

export default function CMOReportPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    api.getAnalytics(from, to)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="analyzer"><style>{STYLES}</style><div className="ld"><div className="sp"></div><p>Loading CMO Report…</p></div></div>
  );
  if (error) return (
    <div className="analyzer"><style>{STYLES}</style><div className="err">Error: {error}</div></div>
  );

  const { ads = [], camps = [], totals = {}, period = {} } = data || {};
  const nDays = period.nDays || 30;
  const tSpend = totals.tSpend || 0;

  return (
    <div className="analyzer">
      <style>{STYLES}</style>
      <RecsTab ads={ads} camps={camps} tSpend={tSpend} nDays={nDays} totals={totals} />
    </div>
  );
}
