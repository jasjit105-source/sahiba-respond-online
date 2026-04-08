export default function KpiCard({ label, value, sub, color = '#1877f2' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow" style={{ borderTopWidth: 3, borderTopColor: color }}>
      <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-extrabold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}
