import { fmtNum } from '../utils/format';

const STEPS = [
  { key: 'clicks', label: 'Link Clicks', color: '#1877f2' },
  { key: 'whatsapp', label: 'WhatsApp Opens', color: '#25D366' },
  { key: 'conversations', label: 'Conversations', color: '#7c3aed' },
  { key: 'qualified', label: 'Qualified Leads', color: '#f59e0b' },
  { key: 'hot', label: 'Hot Leads', color: '#ef4444' },
  { key: 'sales', label: 'Sales', color: '#10b981' },
];

export default function FunnelChart({ data }) {
  const maxVal = Math.max(...STEPS.map(s => data[s.key] || 0), 1);

  return (
    <div className="space-y-2">
      {STEPS.map((step, i) => {
        const val = data[step.key] || 0;
        const pct = (val / maxVal) * 100;
        const prevVal = i > 0 ? (data[STEPS[i - 1].key] || 0) : 0;
        const convRate = i > 0 && prevVal > 0 ? ((val / prevVal) * 100).toFixed(1) + '%' : '';

        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className="w-32 text-right text-xs font-medium text-gray-600">{step.label}</div>
            <div className="flex-1 h-8 bg-gray-100 rounded-md overflow-hidden relative">
              <div
                className="h-full rounded-md transition-all duration-500 flex items-center px-3"
                style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: step.color }}
              >
                <span className="text-white text-xs font-bold">{fmtNum(val)}</span>
              </div>
            </div>
            <div className="w-14 text-xs text-gray-500 font-medium">{convRate}</div>
          </div>
        );
      })}
    </div>
  );
}
