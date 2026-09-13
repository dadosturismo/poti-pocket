const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
}

export function formatValue(value, unit = 'count', compact = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Não disponível';
  const number = Number(value);
  if (unit === 'percent') return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(number);
  if (unit === 'currency') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: 'BRL', notation: compact && Math.abs(number) >= 1e6 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(number) >= 1e6 ? 1 : 2
    }).format(number);
  }
  return new Intl.NumberFormat('pt-BR', {
    notation: compact && Math.abs(number) >= 1e6 ? 'compact' : 'standard',
    maximumFractionDigits: 2
  }).format(number);
}

export function formatPeriod(period) {
  if (!period) return 'Período não informado';
  const monthly = String(period).match(/^(\d{4})-(\d{2})$/);
  if (monthly) return `${MONTHS_LONG[Number(monthly[2]) - 1]} de ${monthly[1]}`;
  const quarter = String(period).match(/^(\d{4})-Q([1-4])$/);
  if (quarter) return `${quarter[2]}º trimestre de ${quarter[1]}`;
  const fullDate = new Date(`${period}T12:00:00`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(period)) && !Number.isNaN(fullDate.getTime())) {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(fullDate);
  }
  return String(period);
}

export function monthShort(month) { return MONTHS_SHORT[month - 1] || ''; }

export function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'data desconhecida' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function relativeChange(current, previous) {
  if (![current, previous].every(value => typeof value === 'number' && Number.isFinite(value)) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function changeBadge(current, previous, unit) {
  if (![current, previous].every(value => typeof value === 'number' && Number.isFinite(value))) return '';
  const delta = current - previous;
  const className = delta > 0 ? 'change--up' : delta < 0 ? 'change--down' : '';
  let text;
  if (unit === 'percent') text = `${delta >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(delta * 100)} p.p.`;
  else {
    const relative = relativeChange(current, previous);
    text = relative === null ? formatValue(delta, unit) : `${relative >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(relative)}`;
  }
  return `<span class="change ${className}">${escapeHtml(text)}</span>`;
}

