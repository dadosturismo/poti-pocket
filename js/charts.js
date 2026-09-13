import { escapeHtml, formatValue } from './format.js';

const COLORS = ['#cf2081', '#06b2c1', '#f9c704', '#e7130b', '#32434c', '#139e2c'];

function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function xPoint(index, count, left, width) { return count <= 1 ? left + width / 2 : left + (index * width) / (count - 1); }
function yPoint(value, max, top, height) { return top + height - (value / (max || 1)) * height; }

export function lineChart({ labels, series, unit = 'count', description = '' }) {
  const usableSeries = series.map(item => ({ ...item, values: item.values.map(value => finite(value) ? value : null) }))
    .filter(item => item.values.some(finite));
  if (!labels.length || !usableSeries.length) return emptyChart();

  const width = 760, height = 310, left = 58, right = 18, top = 20, bottom = 54;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maximum = Math.max(...usableSeries.flatMap(item => item.values.filter(finite)), unit === 'percent' ? .01 : 1) * 1.08;
  const grid = [0, .25, .5, .75, 1].map(fraction => {
    const y = top + plotHeight - plotHeight * fraction;
    return `<line class="grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text x="${left - 8}" y="${y + 4}" text-anchor="end">${escapeHtml(formatValue(maximum * fraction, unit, true))}</text>`;
  }).join('');

  const labelStep = labels.length > 12 ? Math.ceil(labels.length / 12) : 1;
  const axes = labels.map((label, index) => index % labelStep === 0
    ? `<text x="${xPoint(index, labels.length, left, plotWidth)}" y="${height - 20}" text-anchor="middle">${escapeHtml(label)}</text>` : '').join('');

  const paths = usableSeries.map((item, seriesIndex) => {
    const segments = [];
    let current = [];
    item.values.forEach((value, index) => {
      if (finite(value)) current.push([xPoint(index, labels.length, left, plotWidth), yPoint(value, maximum, top, plotHeight)]);
      else if (current.length) { segments.push(current); current = []; }
    });
    if (current.length) segments.push(current);
    return segments.map(segment => {
      const path = segment.map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ');
      const dots = segment.map(point => `<circle cx="${point[0]}" cy="${point[1]}" r="3.5" fill="${COLORS[seriesIndex % COLORS.length]}"/>`).join('');
      return `<path d="${path}" fill="none" stroke="${COLORS[seriesIndex % COLORS.length]}" stroke-width="${seriesIndex ? 2.5 : 3}" ${seriesIndex ? 'stroke-dasharray="7 5"' : ''}/>${dots}`;
    }).join('');
  }).join('');

  const legend = usableSeries.map((item, index) => `<span style="--legend-color:${COLORS[index % COLORS.length]}">${escapeHtml(item.name)}</span>`).join('');
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(description)}"><line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>${grid}${axes}${paths}</svg></div><div class="legend chart-legend">${legend}</div>`;
}

export function barChart({ items, unit = 'count', description = '', limit = 12 }) {
  const usable = items.filter(item => finite(item.value)).slice(0, limit);
  if (!usable.length) return emptyChart();
  const width = 760, height = 320, left = 55, right = 18, top = 20, bottom = 82;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maximum = Math.max(...usable.map(item => item.value), unit === 'percent' ? .01 : 1) * 1.08;
  const gap = 8, barWidth = Math.max(12, (plotWidth - gap * (usable.length - 1)) / usable.length);
  const bars = usable.map((item, index) => {
    const barHeight = (item.value / maximum) * plotHeight;
    const x = left + index * (barWidth + gap), y = top + plotHeight - barHeight;
    const shortLabel = String(item.label).length > 13 ? `${String(item.label).slice(0, 12)}…` : item.label;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${COLORS[index % COLORS.length]}"><title>${escapeHtml(item.label)}: ${escapeHtml(formatValue(item.value, unit))}</title></rect><text x="${x + barWidth / 2}" y="${height - 60}" text-anchor="end" transform="rotate(-38 ${x + barWidth / 2} ${height - 60})">${escapeHtml(shortLabel)}</text>`;
  }).join('');
  const grid = [0, .5, 1].map(fraction => {
    const y = top + plotHeight - plotHeight * fraction;
    return `<line class="grid" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text x="${left - 8}" y="${y + 4}" text-anchor="end">${escapeHtml(formatValue(maximum * fraction, unit, true))}</text>`;
  }).join('');
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(description)}">${grid}<line class="axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>${bars}</svg></div>`;
}

export function donutChart({ items, unit = 'percent', description = '' }) {
  const usable = items.filter(item => finite(item.value) && item.value > 0);
  const total = usable.reduce((sum, item) => sum + item.value, 0);
  if (!usable.length || !total) return emptyChart();
  const center = 130, radius = 82, circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = usable.map((item, index) => {
    const length = circumference * item.value / total;
    const arc = `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${COLORS[index % COLORS.length]}" stroke-width="34" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${center} ${center})"><title>${escapeHtml(item.label)}: ${escapeHtml(formatValue(item.value, unit))}</title></circle>`;
    offset += length;
    return arc;
  }).join('');
  const legend = usable.map((item, index) => `<li><i style="background:${COLORS[index % COLORS.length]}"></i><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(formatValue(item.value, unit))}</strong></li>`).join('');
  return `<div class="donut-layout"><svg viewBox="0 0 260 260" role="img" aria-label="${escapeHtml(description)}">${arcs}<text x="130" y="125" text-anchor="middle">Total</text><text x="130" y="150" text-anchor="middle" class="donut-total">${escapeHtml(formatValue(total, unit))}</text></svg><ul class="donut-legend">${legend}</ul></div>`;
}

function emptyChart() {
  return '<div class="chart-empty">Não há dados suficientes para este gráfico.</div>';
}
