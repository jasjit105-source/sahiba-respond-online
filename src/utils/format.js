export function fmtMoney(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNum(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (isNaN(num)) return n;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function fmtPct(n) {
  if (n == null) return '—';
  return Number(n).toFixed(2) + '%';
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function daysAgo(d) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().split('T')[0];
}
