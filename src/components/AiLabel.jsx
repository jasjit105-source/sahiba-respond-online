import { AI_LABELS } from '../utils/constants';

export default function AiLabel({ label }) {
  const config = AI_LABELS[label] || AI_LABELS.MONITOR;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded border text-[11px] font-bold uppercase tracking-wide ${config.color}`}>
      {config.label}
    </span>
  );
}
