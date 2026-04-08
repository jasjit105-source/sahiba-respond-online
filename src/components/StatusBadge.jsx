const STATUS_COLORS = {
  ACTIVE: 'bg-green-100 text-green-800',
  PAUSED: 'bg-yellow-100 text-yellow-800',
  DELETED: 'bg-red-100 text-red-700',
  ARCHIVED: 'bg-red-100 text-red-700',
  LEARNING: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-200 text-red-800'
};

export default function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {status || 'UNKNOWN'}
    </span>
  );
}
